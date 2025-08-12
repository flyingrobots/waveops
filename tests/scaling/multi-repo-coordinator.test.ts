/**
 * Multi-Repository Coordinator Tests
 * Comprehensive test suite for enterprise cross-repository coordination
 */

import { 
  MultiRepositoryCoordinator,
  MultiRepoCoordinatorDependencies,
  RepositoryClient,
  MultiRepoEventBus,
  CrossRepoPersistence,
  MultiRepoMetricsCollector
} from '../../src/scaling/multi-repo-coordinator';

import {
  RepositoryConfiguration,
  RepositoryRole,
  CoordinationLevel,
  CrossRepositoryWave,
  CrossRepoWaveStatus,
  SynchronizationPoint,
  CrossRepoDependency,
  DependencyType,
  BlockingLevel,
  SyncConditionType,
  SyncPointStatus,
  CrossDepStatus,
  MultiRepositoryCoordinationError
} from '../../src/scaling/types';

import { WaveState, TeamState } from '../../src/types';

describe('MultiRepositoryCoordinator', () => {
  let coordinator: MultiRepositoryCoordinator;
  let mockDependencies: MultiRepoCoordinatorDependencies;
  let mockRepositoryClients: Map<string, jest.Mocked<RepositoryClient>>;
  let mockEventBus: jest.Mocked<MultiRepoEventBus>;
  let mockPersistence: jest.Mocked<CrossRepoPersistence>;
  let mockMetricsCollector: jest.Mocked<MultiRepoMetricsCollector>;

  beforeEach(() => {
    // Create mock repository clients
    mockRepositoryClients = new Map();
    
    const createMockClient = (repoId: string): jest.Mocked<RepositoryClient> => ({
      repositoryId: repoId,
      getWaveState: jest.fn(),
      updateWaveState: jest.fn(),
      getTasks: jest.fn(),
      getTeamStates: jest.fn(),
      notifyDependencyChange: jest.fn(),
      waitForSynchronizationPoint: jest.fn()
    });

    mockRepositoryClients.set('repo-1', createMockClient('repo-1'));
    mockRepositoryClients.set('repo-2', createMockClient('repo-2'));
    mockRepositoryClients.set('repo-3', createMockClient('repo-3'));

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    };

    // Create mock persistence layer
    mockPersistence = {
      saveWave: jest.fn().mockResolvedValue(undefined),
      loadWave: jest.fn(),
      saveProgress: jest.fn().mockResolvedValue(undefined),
      loadProgress: jest.fn(),
      saveDependency: jest.fn().mockResolvedValue(undefined),
      loadDependencies: jest.fn().mockResolvedValue([])
    };

    // Create mock metrics collector
    mockMetricsCollector = {
      recordCoordinationLatency: jest.fn(),
      recordSynchronizationTime: jest.fn(),
      recordDependencyResolution: jest.fn(),
      recordCrossRepoThroughput: jest.fn(),
      recordFailure: jest.fn()
    };

    // Create mock dependencies
    mockDependencies = {
      repositoryConfigurations: createMockRepositoryConfigurations(),
      waveCoordinator: {} as any, // Mock if needed
      repositoryClients: mockRepositoryClients,
      eventBus: mockEventBus,
      persistenceLayer: mockPersistence,
      metricsCollector: mockMetricsCollector
    };

    coordinator = new MultiRepositoryCoordinator(mockDependencies);
  });

  describe('initializeCrossRepositoryWave', () => {
    it('should initialize a cross-repository wave successfully', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const participatingRepositories = ['repo-1', 'repo-2'];
      const dependencies: CrossRepoDependency[] = [];
      const synchronizationPoints: SynchronizationPoint[] = [{
        pointId: 'sync-1',
        name: 'Initial Sync',
        repositories: participatingRepositories,
        condition: {
          type: SyncConditionType.ALL_READY,
          criteria: {}
        },
        timeout: 300000,
        status: SyncPointStatus.WAITING
      }];

      // Mock repository wave states
      const mockWaveState: WaveState = {
        plan: 'test-plan',
        wave: 1,
        tz: 'UTC',
        teams: {},
        all_ready: true,
        updated_at: new Date().toISOString()
      };

      mockRepositoryClients.get('repo-1')!.getWaveState.mockResolvedValue(mockWaveState);
      mockRepositoryClients.get('repo-2')!.getWaveState.mockResolvedValue(mockWaveState);

      // Act
      const result = await coordinator.initializeCrossRepositoryWave(
        waveId,
        participatingRepositories,
        dependencies,
        synchronizationPoints
      );

      // Assert
      expect(result.waveId).toBe(waveId);
      expect(result.participatingRepositories).toEqual(participatingRepositories);
      expect(result.status).toBe(CrossRepoWaveStatus.SYNCHRONIZING);
      expect(mockPersistence.saveWave).toHaveBeenCalledWith(
        expect.objectContaining({ waveId })
      );
      expect(mockEventBus.publish).toHaveBeenCalled();
      expect(mockMetricsCollector.recordCrossRepoThroughput).toHaveBeenCalledWith(
        participatingRepositories.length,
        0
      );
    });

    it('should throw error when repository is not configured', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const participatingRepositories = ['non-existent-repo'];

      // Act & Assert
      await expect(coordinator.initializeCrossRepositoryWave(
        waveId,
        participatingRepositories,
        [],
        []
      )).rejects.toThrow(MultiRepositoryCoordinationError);
    });

    it('should throw error when repository client is not available', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const participatingRepositories = ['repo-4']; // Not in mock clients

      // Mock configuration but no client
      mockDependencies.repositoryConfigurations.push({
        repositoryId: 'repo-4',
        name: 'Repo 4',
        url: 'https://github.com/test/repo4',
        owner: 'test',
        defaultBranch: 'main',
        coordinationRole: RepositoryRole.SECONDARY,
        teamMappings: [],
        dependencies: [],
        scalingConfig: {} as any,
        securityConfig: {} as any
      });

      // Act & Assert
      await expect(coordinator.initializeCrossRepositoryWave(
        waveId,
        participatingRepositories,
        [],
        []
      )).rejects.toThrow(MultiRepositoryCoordinationError);
    });
  });

  describe('executeCoordinatedWave', () => {
    it('should execute a coordinated wave successfully', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const crossRepoWave: CrossRepositoryWave = {
        waveId,
        participatingRepositories: ['repo-1', 'repo-2'],
        synchronizationPoints: [{
          pointId: 'sync-1',
          name: 'Initial Sync',
          repositories: ['repo-1', 'repo-2'],
          condition: { type: SyncConditionType.ALL_READY, criteria: {} },
          timeout: 300000,
          status: SyncPointStatus.READY
        }],
        dependencies: [],
        status: CrossRepoWaveStatus.SYNCHRONIZING,
        startTime: new Date(),
        estimatedEndTime: new Date(Date.now() + 300000)
      };

      // Mock successful synchronization
      mockRepositoryClients.get('repo-1')!.waitForSynchronizationPoint
        .mockResolvedValue(true);
      mockRepositoryClients.get('repo-2')!.waitForSynchronizationPoint
        .mockResolvedValue(true);

      // Mock the private method by setting up the wave
      (coordinator as any).activeWaves.set(waveId, crossRepoWave);

      // Act
      await coordinator.executeCoordinatedWave(waveId);

      // Assert
      expect(crossRepoWave.status).toBe(CrossRepoWaveStatus.COMPLETED);
      expect(crossRepoWave.actualEndTime).toBeDefined();
    });

    it('should handle wave execution failure', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const crossRepoWave: CrossRepositoryWave = {
        waveId,
        participatingRepositories: ['repo-1'],
        synchronizationPoints: [],
        dependencies: [],
        status: CrossRepoWaveStatus.SYNCHRONIZING,
        startTime: new Date(),
        estimatedEndTime: new Date(Date.now() + 300000)
      };

      (coordinator as any).activeWaves.set(waveId, crossRepoWave);

      // Mock failure during execution
      mockRepositoryClients.get('repo-1')!.getWaveState
        .mockRejectedValue(new Error('Repository unavailable'));

      // Act & Assert
      await expect(coordinator.executeCoordinatedWave(waveId))
        .rejects.toThrow('Repository unavailable');
      expect(crossRepoWave.status).toBe(CrossRepoWaveStatus.FAILED);
    });
  });

  describe('monitorWaveProgress', () => {
    it('should monitor wave progress across repositories', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const crossRepoWave: CrossRepositoryWave = {
        waveId,
        participatingRepositories: ['repo-1', 'repo-2'],
        synchronizationPoints: [],
        dependencies: [],
        status: CrossRepoWaveStatus.EXECUTING,
        startTime: new Date(),
        estimatedEndTime: new Date(Date.now() + 300000)
      };

      (coordinator as any).activeWaves.set(waveId, crossRepoWave);

      // Mock wave states and tasks
      const mockWaveState1: WaveState = {
        plan: 'test-plan',
        wave: 1,
        tz: 'UTC',
        teams: {
          'team-1': { status: 'ready', tasks: ['task-1'] }
        },
        all_ready: true,
        updated_at: new Date().toISOString()
      };

      const mockWaveState2: WaveState = {
        plan: 'test-plan',
        wave: 1,
        tz: 'UTC',
        teams: {
          'team-2': { status: 'in_progress', tasks: ['task-2'] }
        },
        all_ready: false,
        updated_at: new Date().toISOString()
      };

      mockRepositoryClients.get('repo-1')!.getWaveState.mockResolvedValue(mockWaveState1);
      mockRepositoryClients.get('repo-2')!.getWaveState.mockResolvedValue(mockWaveState2);
      mockRepositoryClients.get('repo-1')!.getTeamStates.mockResolvedValue(new Map([
        ['team-1', { status: 'ready', tasks: ['task-1'] }]
      ]));
      mockRepositoryClients.get('repo-2')!.getTeamStates.mockResolvedValue(new Map([
        ['team-2', { status: 'in_progress', tasks: ['task-2'] }]
      ]));
      mockRepositoryClients.get('repo-1')!.getTasks.mockResolvedValue([
        { id: 'task-1', title: 'Task 1', wave: 1, team: 'team-1', depends_on: [], acceptance: [], critical: false }
      ]);
      mockRepositoryClients.get('repo-2')!.getTasks.mockResolvedValue([
        { id: 'task-2', title: 'Task 2', wave: 1, team: 'team-2', depends_on: [], acceptance: [], critical: false }
      ]);

      // Act
      const progress = await coordinator.monitorWaveProgress(waveId);

      // Assert
      expect(progress.waveId).toBe(waveId);
      expect(progress.repositoryProgress.size).toBe(2);
      expect(progress.overallProgress).toBeGreaterThan(0);
      expect(progress.estimatedCompletion).toBeInstanceOf(Date);
      expect(mockPersistence.saveProgress).toHaveBeenCalledWith(waveId, progress);
    });

    it('should throw error for non-existent wave', async () => {
      // Act & Assert
      await expect(coordinator.monitorWaveProgress('non-existent'))
        .rejects.toThrow(MultiRepositoryCoordinationError);
    });
  });

  describe('handleDependencyChange', () => {
    it('should handle dependency status changes', async () => {
      // Arrange
      const dependency: CrossRepoDependency = {
        sourceRepository: 'repo-1',
        targetRepository: 'repo-2',
        sourceTask: 'task-1',
        targetTask: 'task-2',
        dependencyType: DependencyType.HARD_DEPENDENCY,
        status: CrossDepStatus.SATISFIED
      };

      // Act
      await coordinator.handleDependencyChange(dependency);

      // Assert
      expect(mockRepositoryClients.get('repo-1')!.notifyDependencyChange)
        .toHaveBeenCalledWith(dependency);
      expect(mockRepositoryClients.get('repo-2')!.notifyDependencyChange)
        .toHaveBeenCalledWith(dependency);
      expect(mockMetricsCollector.recordDependencyResolution)
        .toHaveBeenCalledWith('repo-1-repo-2', dependency.status);
    });

    it('should throw error when repository client is not found', async () => {
      // Arrange
      const dependency: CrossRepoDependency = {
        sourceRepository: 'non-existent',
        targetRepository: 'repo-2',
        sourceTask: 'task-1',
        targetTask: 'task-2',
        dependencyType: DependencyType.HARD_DEPENDENCY,
        status: CrossDepStatus.SATISFIED
      };

      // Act & Assert
      await expect(coordinator.handleDependencyChange(dependency))
        .rejects.toThrow(MultiRepositoryCoordinationError);
    });
  });

  describe('getCoordinationDashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      const crossRepoWave: CrossRepositoryWave = {
        waveId,
        participatingRepositories: ['repo-1', 'repo-2'],
        synchronizationPoints: [],
        dependencies: [],
        status: CrossRepoWaveStatus.EXECUTING,
        startTime: new Date(),
        estimatedEndTime: new Date(Date.now() + 300000)
      };

      (coordinator as any).activeWaves.set(waveId, crossRepoWave);

      // Mock repository states
      const mockWaveState: WaveState = {
        plan: 'test-plan',
        wave: 1,
        tz: 'UTC',
        teams: { 'team-1': { status: 'ready', tasks: [] } },
        all_ready: true,
        updated_at: new Date().toISOString()
      };

      mockRepositoryClients.get('repo-1')!.getWaveState.mockResolvedValue(mockWaveState);
      mockRepositoryClients.get('repo-2')!.getWaveState.mockResolvedValue(mockWaveState);
      mockRepositoryClients.get('repo-1')!.getTeamStates.mockResolvedValue(new Map());
      mockRepositoryClients.get('repo-2')!.getTeamStates.mockResolvedValue(new Map());
      mockRepositoryClients.get('repo-1')!.getTasks.mockResolvedValue([]);
      mockRepositoryClients.get('repo-2')!.getTasks.mockResolvedValue([]);

      // Act
      const dashboard = await coordinator.getCoordinationDashboard();

      // Assert
      expect(dashboard).toBeDefined();
      expect(dashboard.activeWaves).toHaveLength(1);
      expect(dashboard.repositoryStatuses.size).toBe(3); // All configured repos
      expect(dashboard.systemMetrics.totalRepositories).toBe(3);
      expect(dashboard.systemMetrics.activeCoordinations).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle repository connectivity issues gracefully', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      mockRepositoryClients.get('repo-1')!.getWaveState
        .mockRejectedValue(new Error('Network timeout'));

      // Act & Assert
      await expect(coordinator.initializeCrossRepositoryWave(
        waveId,
        ['repo-1'],
        [],
        []
      )).rejects.toThrow(MultiRepositoryCoordinationError);
    });

    it('should record metrics for failures', async () => {
      // Arrange
      const waveId = 'cross-wave-1';
      mockRepositoryClients.get('repo-1')!.getWaveState
        .mockRejectedValue(new Error('Service unavailable'));

      // Act
      try {
        await coordinator.initializeCrossRepositoryWave(waveId, ['repo-1'], [], []);
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(mockMetricsCollector.recordFailure).toHaveBeenCalledWith(
        'repo-1',
        'initialization_failed',
        'Service unavailable'
      );
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple concurrent waves', async () => {
      // Arrange
      const wavePromises = [];
      const numWaves = 5;

      // Mock repository states for all waves
      const mockWaveState: WaveState = {
        plan: 'test-plan',
        wave: 1,
        tz: 'UTC',
        teams: {},
        all_ready: true,
        updated_at: new Date().toISOString()
      };

      mockRepositoryClients.get('repo-1')!.getWaveState.mockResolvedValue(mockWaveState);
      mockRepositoryClients.get('repo-2')!.getWaveState.mockResolvedValue(mockWaveState);

      // Act
      for (let i = 0; i < numWaves; i++) {
        wavePromises.push(
          coordinator.initializeCrossRepositoryWave(
            `wave-${i}`,
            ['repo-1', 'repo-2'],
            [],
            []
          )
        );
      }

      const waves = await Promise.all(wavePromises);

      // Assert
      expect(waves).toHaveLength(numWaves);
      waves.forEach((wave, index) => {
        expect(wave.waveId).toBe(`wave-${index}`);
        expect(wave.status).toBe(CrossRepoWaveStatus.SYNCHRONIZING);
      });
    });

    it('should handle large number of repositories', async () => {
      // Arrange
      const numRepos = 20;
      const repositoryIds = Array.from({ length: numRepos }, (_, i) => `repo-${i}`);

      // Add repository configurations and clients
      for (const repoId of repositoryIds) {
        mockDependencies.repositoryConfigurations.push({
          repositoryId: repoId,
          name: `Repository ${repoId}`,
          url: `https://github.com/test/${repoId}`,
          owner: 'test',
          defaultBranch: 'main',
          coordinationRole: RepositoryRole.SECONDARY,
          teamMappings: [],
          dependencies: [],
          scalingConfig: {} as any,
          securityConfig: {} as any
        });

        const mockClient = {
          repositoryId: repoId,
          getWaveState: jest.fn().mockResolvedValue({
            plan: 'test-plan',
            wave: 1,
            tz: 'UTC',
            teams: {},
            all_ready: true,
            updated_at: new Date().toISOString()
          }),
          updateWaveState: jest.fn(),
          getTasks: jest.fn().mockResolvedValue([]),
          getTeamStates: jest.fn().mockResolvedValue(new Map()),
          notifyDependencyChange: jest.fn(),
          waitForSynchronizationPoint: jest.fn().mockResolvedValue(true)
        };

        mockRepositoryClients.set(repoId, mockClient);
      }

      // Act
      const startTime = Date.now();
      const wave = await coordinator.initializeCrossRepositoryWave(
        'large-wave',
        repositoryIds,
        [],
        []
      );
      const duration = Date.now() - startTime;

      // Assert
      expect(wave.participatingRepositories).toHaveLength(numRepos);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(mockMetricsCollector.recordCrossRepoThroughput)
        .toHaveBeenCalledWith(numRepos, 0);
    });
  });
});

function createMockRepositoryConfigurations(): RepositoryConfiguration[] {
  return [
    {
      repositoryId: 'repo-1',
      name: 'Primary Repository',
      url: 'https://github.com/test/repo1',
      owner: 'test',
      defaultBranch: 'main',
      coordinationRole: RepositoryRole.PRIMARY,
      teamMappings: [{
        teamId: 'team-1',
        repositoryTeams: ['repo1-team'],
        permissions: [],
        coordinationLevel: CoordinationLevel.FULL
      }],
      dependencies: [],
      scalingConfig: {
        minInstances: 1,
        maxInstances: 5,
        targetConcurrentWaves: 10,
        autoScalingEnabled: true,
        scalingMetrics: [],
        resourceLimits: {
          cpuLimit: '1000m',
          memoryLimit: '2Gi',
          maxConnections: 100
        }
      },
      securityConfig: {} as any
    },
    {
      repositoryId: 'repo-2',
      name: 'Secondary Repository',
      url: 'https://github.com/test/repo2',
      owner: 'test',
      defaultBranch: 'main',
      coordinationRole: RepositoryRole.SECONDARY,
      teamMappings: [],
      dependencies: [],
      scalingConfig: {
        minInstances: 1,
        maxInstances: 3,
        targetConcurrentWaves: 5,
        autoScalingEnabled: true,
        scalingMetrics: [],
        resourceLimits: {
          cpuLimit: '500m',
          memoryLimit: '1Gi',
          maxConnections: 50
        }
      },
      securityConfig: {} as any
    },
    {
      repositoryId: 'repo-3',
      name: 'Observer Repository',
      url: 'https://github.com/test/repo3',
      owner: 'test',
      defaultBranch: 'main',
      coordinationRole: RepositoryRole.OBSERVER,
      teamMappings: [],
      dependencies: [],
      scalingConfig: {
        minInstances: 1,
        maxInstances: 2,
        targetConcurrentWaves: 2,
        autoScalingEnabled: false,
        scalingMetrics: [],
        resourceLimits: {
          cpuLimit: '250m',
          memoryLimit: '512Mi',
          maxConnections: 25
        }
      },
      securityConfig: {} as any
    }
  ];
}