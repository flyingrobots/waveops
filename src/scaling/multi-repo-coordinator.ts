/**
 * Multi-Repository Coordination System
 * Handles cross-repository wave coordination and synchronization
 */

import { 
  RepositoryConfiguration, 
  CrossRepositoryWave, 
  SynchronizationPoint,
  CrossRepoDependency,
  CrossRepoWaveStatus,
  SyncPointStatus,
  CrossDepStatus,
  MultiRepositoryCoordinationError,
  RepositoryRole,
  CoordinationLevel 
} from './types';
import { EnhancedWaveCoordinator } from '../coordination/enhanced-coordinator';
import { WaveState, TeamState, Task } from '../types';

export interface MultiRepoCoordinatorDependencies {
  repositoryConfigurations: RepositoryConfiguration[];
  waveCoordinator: EnhancedWaveCoordinator;
  repositoryClients: Map<string, RepositoryClient>;
  eventBus: MultiRepoEventBus;
  persistenceLayer: CrossRepoPersistence;
  metricsCollector: MultiRepoMetricsCollector;
}

export interface RepositoryClient {
  repositoryId: string;
  getWaveState(): Promise<WaveState>;
  updateWaveState(state: WaveState): Promise<void>;
  getTasks(wave: number): Promise<Task[]>;
  getTeamStates(): Promise<Map<string, TeamState>>;
  notifyDependencyChange(dependency: CrossRepoDependency): Promise<void>;
  waitForSynchronizationPoint(pointId: string, timeout: number): Promise<boolean>;
}

export interface MultiRepoEventBus {
  publish(event: MultiRepoEvent): Promise<void>;
  subscribe(eventType: string, handler: (event: MultiRepoEvent) => Promise<void>): void;
  unsubscribe(eventType: string, handler: (event: MultiRepoEvent) => Promise<void>): void;
}

export interface MultiRepoEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  sourceRepository: string;
  targetRepositories?: string[];
  payload: Record<string, unknown>;
  correlationId: string;
}

export interface CrossRepoPersistence {
  saveWave(wave: CrossRepositoryWave): Promise<void>;
  loadWave(waveId: string): Promise<CrossRepositoryWave | null>;
  saveProgress(waveId: string, progress: CrossRepoProgress): Promise<void>;
  loadProgress(waveId: string): Promise<CrossRepoProgress | null>;
  saveDependency(dependency: CrossRepoDependency): Promise<void>;
  loadDependencies(waveId: string): Promise<CrossRepoDependency[]>;
}

export interface CrossRepoProgress {
  waveId: string;
  repositoryProgress: Map<string, RepositoryProgress>;
  synchronizationStatus: Map<string, SyncPointStatus>;
  dependencyStatus: Map<string, CrossDepStatus>;
  overallProgress: number;
  estimatedCompletion: Date;
}

export interface RepositoryProgress {
  repositoryId: string;
  currentWave: number;
  completedTasks: number;
  totalTasks: number;
  blockedTasks: number;
  teamStatuses: Map<string, TeamState>;
  lastUpdate: Date;
}

export interface MultiRepoMetricsCollector {
  recordCoordinationLatency(repositoryId: string, latency: number): void;
  recordSynchronizationTime(pointId: string, duration: number): void;
  recordDependencyResolution(depId: string, resolution: CrossDepStatus): void;
  recordCrossRepoThroughput(repositoriesCount: number, throughput: number): void;
  recordFailure(repositoryId: string, errorType: string, details: string): void;
}

/**
 * Multi-Repository Wave Coordinator
 * Orchestrates wave execution across multiple repositories with dependency management
 */
export class MultiRepositoryCoordinator {
  private readonly dependencies: MultiRepoCoordinatorDependencies;
  private activeWaves: Map<string, CrossRepositoryWave>;
  private synchronizationManager: SynchronizationManager;
  private dependencyResolver: CrossRepoDependencyResolver;
  private coordinationState: CoordinationState;

  constructor(dependencies: MultiRepoCoordinatorDependencies) {
    this.dependencies = dependencies;
    this.activeWaves = new Map();
    this.synchronizationManager = new SynchronizationManager(dependencies);
    this.dependencyResolver = new CrossRepoDependencyResolver(dependencies);
    this.coordinationState = new CoordinationState();
    this.initializeEventHandlers();
  }

  /**
   * Initialize a cross-repository wave coordination
   */
  async initializeCrossRepositoryWave(
    waveId: string,
    participatingRepositories: string[],
    dependencies: CrossRepoDependency[],
    synchronizationPoints: SynchronizationPoint[]
  ): Promise<CrossRepositoryWave> {
    this.dependencies.metricsCollector.recordCrossRepoThroughput(
      participatingRepositories.length,
      0
    );

    // Validate participating repositories
    await this.validateParticipatingRepositories(participatingRepositories);

    // Create cross-repository wave
    const crossRepoWave: CrossRepositoryWave = {
      waveId,
      participatingRepositories,
      synchronizationPoints,
      dependencies,
      status: CrossRepoWaveStatus.INITIALIZING,
      startTime: new Date(),
      estimatedEndTime: this.calculateEstimatedEndTime(
        participatingRepositories,
        dependencies
      )
    };

    // Persist the wave configuration
    await this.dependencies.persistenceLayer.saveWave(crossRepoWave);

    // Initialize repositories
    await this.initializeRepositoriesForWave(crossRepoWave);

    // Set up dependency tracking
    await this.dependencyResolver.initializeDependencies(dependencies);

    // Create synchronization points
    await this.synchronizationManager.initializeSynchronizationPoints(
      synchronizationPoints
    );

    this.activeWaves.set(waveId, crossRepoWave);
    crossRepoWave.status = CrossRepoWaveStatus.SYNCHRONIZING;

    // Notify all repositories about wave initialization
    await this.notifyWaveInitialization(crossRepoWave);

    return crossRepoWave;
  }

  /**
   * Execute coordinated wave across all repositories
   */
  async executeCoordinatedWave(waveId: string): Promise<void> {
    const crossRepoWave = this.activeWaves.get(waveId);
    if (!crossRepoWave) {
      throw new MultiRepositoryCoordinationError(
        `Cross-repository wave not found: ${waveId}`,
        '',
        'execute_wave'
      );
    }

    try {
      crossRepoWave.status = CrossRepoWaveStatus.EXECUTING;

      // Execute wave in phases
      await this.executePreSynchronizationPhase(crossRepoWave);
      await this.executeSynchronizationPhase(crossRepoWave);
      await this.executeMainExecutionPhase(crossRepoWave);
      await this.executePostSynchronizationPhase(crossRepoWave);

      crossRepoWave.status = CrossRepoWaveStatus.COMPLETING;
      await this.completeWave(crossRepoWave);

      crossRepoWave.status = CrossRepoWaveStatus.COMPLETED;
      crossRepoWave.actualEndTime = new Date();

    } catch (error) {
      crossRepoWave.status = CrossRepoWaveStatus.FAILED;
      await this.handleWaveFailure(crossRepoWave, error as Error);
      throw error;
    }
  }

  /**
   * Monitor wave progress across repositories
   */
  async monitorWaveProgress(waveId: string): Promise<CrossRepoProgress> {
    const crossRepoWave = this.activeWaves.get(waveId);
    if (!crossRepoWave) {
      throw new MultiRepositoryCoordinationError(
        `Wave not found: ${waveId}`,
        '',
        'monitor_progress'
      );
    }

    const repositoryProgress = new Map<string, RepositoryProgress>();

    for (const repoId of crossRepoWave.participatingRepositories) {
      const client = this.dependencies.repositoryClients.get(repoId);
      if (!client) {
        throw new MultiRepositoryCoordinationError(
          `Repository client not found: ${repoId}`,
          repoId,
          'monitor_progress'
        );
      }

      const waveState = await client.getWaveState();
      const teamStates = await client.getTeamStates();
      const tasks = await client.getTasks(waveState.wave);

      const completedTasks = tasks.filter(task => {
        const teamState = waveState.teams[task.team];
        return teamState?.status === 'ready';
      }).length;

      const blockedTasks = tasks.filter(task => {
        const teamState = waveState.teams[task.team];
        return teamState?.status === 'blocked';
      }).length;

      repositoryProgress.set(repoId, {
        repositoryId: repoId,
        currentWave: waveState.wave,
        completedTasks,
        totalTasks: tasks.length,
        blockedTasks,
        teamStatuses: teamStates,
        lastUpdate: new Date()
      });
    }

    const synchronizationStatus = await this.synchronizationManager
      .getSynchronizationStatus(waveId);

    const dependencyStatus = await this.dependencyResolver
      .getDependencyStatus(waveId);

    const overallProgress = this.calculateOverallProgress(
      repositoryProgress,
      synchronizationStatus,
      dependencyStatus
    );

    const progress: CrossRepoProgress = {
      waveId,
      repositoryProgress,
      synchronizationStatus,
      dependencyStatus,
      overallProgress,
      estimatedCompletion: this.recalculateEstimatedCompletion(
        crossRepoWave,
        repositoryProgress
      )
    };

    await this.dependencies.persistenceLayer.saveProgress(waveId, progress);
    return progress;
  }

  /**
   * Handle dependency changes between repositories
   */
  async handleDependencyChange(dependency: CrossRepoDependency): Promise<void> {
    const sourceClient = this.dependencies.repositoryClients.get(
      dependency.sourceRepository
    );
    const targetClient = this.dependencies.repositoryClients.get(
      dependency.targetRepository
    );

    if (!sourceClient || !targetClient) {
      throw new MultiRepositoryCoordinationError(
        'Repository client not found for dependency',
        dependency.sourceRepository,
        'handle_dependency'
      );
    }

    // Update dependency status
    await this.dependencyResolver.updateDependencyStatus(dependency);

    // Notify affected repositories
    await sourceClient.notifyDependencyChange(dependency);
    await targetClient.notifyDependencyChange(dependency);

    // Check if this change affects synchronization points
    await this.synchronizationManager.checkSynchronizationPoints(
      dependency.sourceRepository,
      dependency
    );

    this.dependencies.metricsCollector.recordDependencyResolution(
      `${dependency.sourceRepository}-${dependency.targetRepository}`,
      dependency.status
    );
  }

  /**
   * Get unified coordination dashboard data
   */
  async getCoordinationDashboard(): Promise<CrossRepoCoordinationDashboard> {
    const dashboardData: CrossRepoCoordinationDashboard = {
      activeWaves: [],
      repositoryStatuses: new Map(),
      systemMetrics: {
        totalRepositories: this.dependencies.repositoryConfigurations.length,
        activeCoordinations: this.activeWaves.size,
        averageCoordinationLatency: 0,
        throughput: 0,
        errorRate: 0
      },
      alerts: [],
      performance: {
        coordinationLatency: new Map(),
        synchronizationTimes: new Map(),
        dependencyResolutionTimes: new Map()
      }
    };

    // Populate active waves
    for (const [waveId, wave] of this.activeWaves) {
      const progress = await this.monitorWaveProgress(waveId);
      dashboardData.activeWaves.push({
        waveId,
        status: wave.status,
        progress: progress.overallProgress,
        repositoriesCount: wave.participatingRepositories.length,
        startTime: wave.startTime,
        estimatedEndTime: progress.estimatedCompletion
      });
    }

    // Get repository statuses
    for (const repoConfig of this.dependencies.repositoryConfigurations) {
      const client = this.dependencies.repositoryClients.get(repoConfig.repositoryId);
      if (client) {
        try {
          const waveState = await client.getWaveState();
          const teamStates = await client.getTeamStates();
          
          dashboardData.repositoryStatuses.set(repoConfig.repositoryId, {
            repositoryId: repoConfig.repositoryId,
            name: repoConfig.name,
            role: repoConfig.coordinationRole,
            currentWave: waveState.wave,
            allReady: waveState.all_ready,
            teamsCount: Object.keys(waveState.teams).length,
            lastUpdate: new Date(waveState.updated_at),
            health: 'healthy'
          });
        } catch (error) {
          dashboardData.repositoryStatuses.set(repoConfig.repositoryId, {
            repositoryId: repoConfig.repositoryId,
            name: repoConfig.name,
            role: repoConfig.coordinationRole,
            currentWave: 0,
            allReady: false,
            teamsCount: 0,
            lastUpdate: new Date(),
            health: 'unhealthy',
            error: (error as Error).message
          });
        }
      }
    }

    return dashboardData;
  }

  private async validateParticipatingRepositories(
    repositories: string[]
  ): Promise<void> {
    for (const repoId of repositories) {
      const config = this.dependencies.repositoryConfigurations.find(
        r => r.repositoryId === repoId
      );

      if (!config) {
        throw new MultiRepositoryCoordinationError(
          `Repository configuration not found: ${repoId}`,
          repoId,
          'validate_repositories'
        );
      }

      const client = this.dependencies.repositoryClients.get(repoId);
      if (!client) {
        throw new MultiRepositoryCoordinationError(
          `Repository client not configured: ${repoId}`,
          repoId,
          'validate_repositories'
        );
      }

      // Test repository connectivity
      try {
        await client.getWaveState();
      } catch (error) {
        throw new MultiRepositoryCoordinationError(
          `Cannot connect to repository: ${repoId}`,
          repoId,
          'validate_repositories',
          { error: (error as Error).message }
        );
      }
    }
  }

  private async initializeRepositoriesForWave(
    wave: CrossRepositoryWave
  ): Promise<void> {
    const initPromises = wave.participatingRepositories.map(async (repoId) => {
      const client = this.dependencies.repositoryClients.get(repoId);
      if (!client) {return;}

      try {
        // Initialize repository for cross-repo coordination
        await this.dependencies.eventBus.publish({
          eventId: `init-${wave.waveId}-${repoId}`,
          eventType: 'repository.initialize',
          timestamp: new Date(),
          sourceRepository: '',
          targetRepositories: [repoId],
          payload: {
            waveId: wave.waveId,
            synchronizationPoints: wave.synchronizationPoints,
            dependencies: wave.dependencies.filter(
              d => d.sourceRepository === repoId || d.targetRepository === repoId
            )
          },
          correlationId: wave.waveId
        });
      } catch (error) {
        this.dependencies.metricsCollector.recordFailure(
          repoId,
          'initialization_failed',
          (error as Error).message
        );
        throw error;
      }
    });

    await Promise.all(initPromises);
  }

  private calculateEstimatedEndTime(
    repositories: string[],
    dependencies: CrossRepoDependency[]
  ): Date {
    // Simple estimation based on repository count and dependencies
    const baseTime = repositories.length * 300000; // 5 minutes per repo
    const dependencyTime = dependencies.length * 60000; // 1 minute per dependency
    const coordinationOverhead = repositories.length * 30000; // 30 seconds coordination overhead per repo
    
    const totalEstimatedMs = baseTime + dependencyTime + coordinationOverhead;
    return new Date(Date.now() + totalEstimatedMs);
  }

  private async executePreSynchronizationPhase(
    wave: CrossRepositoryWave
  ): Promise<void> {
    // Validate all repositories are ready for coordination
    await this.validateRepositoriesReadiness(wave);

    // Set up cross-repository communication channels
    await this.setupCommunicationChannels(wave);

    // Initialize dependency tracking
    await this.dependencyResolver.startDependencyTracking(wave.waveId);
  }

  private async executeSynchronizationPhase(
    wave: CrossRepositoryWave
  ): Promise<void> {
    // Execute synchronization points in order
    for (const syncPoint of wave.synchronizationPoints) {
      await this.synchronizationManager.executeSynchronizationPoint(
        syncPoint,
        wave.participatingRepositories
      );
    }
  }

  private async executeMainExecutionPhase(
    wave: CrossRepositoryWave
  ): Promise<void> {
    // Coordinate wave execution across all repositories
    const executionPromises = wave.participatingRepositories.map(async (repoId) => {
      const client = this.dependencies.repositoryClients.get(repoId);
      if (!client) {return;}

      return this.executeRepositoryWave(repoId, wave);
    });

    await Promise.all(executionPromises);
  }

  private async executePostSynchronizationPhase(
    wave: CrossRepositoryWave
  ): Promise<void> {
    // Final synchronization and validation
    await this.synchronizationManager.finalSynchronization(
      wave.waveId,
      wave.participatingRepositories
    );

    // Validate all dependencies are satisfied
    await this.dependencyResolver.validateAllDependencies(wave.waveId);
  }

  private async completeWave(wave: CrossRepositoryWave): Promise<void> {
    // Notify all repositories of wave completion
    await this.notifyWaveCompletion(wave);

    // Clean up resources
    await this.cleanupWaveResources(wave);

    // Update metrics
    this.dependencies.metricsCollector.recordCrossRepoThroughput(
      wave.participatingRepositories.length,
      this.calculateThroughput(wave)
    );
  }

  private async handleWaveFailure(
    wave: CrossRepositoryWave,
    error: Error
  ): Promise<void> {
    // Record failure metrics
    for (const repoId of wave.participatingRepositories) {
      this.dependencies.metricsCollector.recordFailure(
        repoId,
        'wave_execution_failed',
        error.message
      );
    }

    // Notify repositories of failure
    await this.notifyWaveFailure(wave, error);

    // Attempt cleanup
    try {
      await this.cleanupWaveResources(wave);
    } catch (cleanupError) {
      console.error('Error during wave cleanup:', cleanupError);
    }
  }

  private calculateOverallProgress(
    repositoryProgress: Map<string, RepositoryProgress>,
    synchronizationStatus: Map<string, SyncPointStatus>,
    dependencyStatus: Map<string, CrossDepStatus>
  ): number {
    let totalProgress = 0;
    let totalWeight = 0;

    // Repository progress (70% weight)
    for (const [_, progress] of repositoryProgress) {
      const repoProgress = progress.totalTasks > 0 
        ? progress.completedTasks / progress.totalTasks 
        : 0;
      totalProgress += repoProgress * 0.7;
      totalWeight += 0.7;
    }

    // Synchronization progress (20% weight)
    let syncProgress = 0;
    let syncCount = 0;
    for (const [_, status] of synchronizationStatus) {
      if (status === SyncPointStatus.SYNCHRONIZED) {syncProgress += 1;}
      syncCount += 1;
    }
    if (syncCount > 0) {
      totalProgress += (syncProgress / syncCount) * 0.2;
      totalWeight += 0.2;
    }

    // Dependency progress (10% weight)
    let depProgress = 0;
    let depCount = 0;
    for (const [_, status] of dependencyStatus) {
      if (status === CrossDepStatus.SATISFIED) {depProgress += 1;}
      depCount += 1;
    }
    if (depCount > 0) {
      totalProgress += (depProgress / depCount) * 0.1;
      totalWeight += 0.1;
    }

    return totalWeight > 0 ? totalProgress / totalWeight : 0;
  }

  private recalculateEstimatedCompletion(
    wave: CrossRepositoryWave,
    repositoryProgress: Map<string, RepositoryProgress>
  ): Date {
    // Recalculate based on current progress
    let maxEstimatedTime = Date.now();

    for (const [_, progress] of repositoryProgress) {
      if (progress.totalTasks > 0 && progress.completedTasks < progress.totalTasks) {
        const remainingTasks = progress.totalTasks - progress.completedTasks;
        const avgTimePerTask = 300000; // 5 minutes per task (estimated)
        const estimatedTime = Date.now() + (remainingTasks * avgTimePerTask);
        maxEstimatedTime = Math.max(maxEstimatedTime, estimatedTime);
      }
    }

    return new Date(maxEstimatedTime);
  }

  private initializeEventHandlers(): void {
    this.dependencies.eventBus.subscribe('repository.state_changed', 
      this.handleRepositoryStateChange.bind(this));
    this.dependencies.eventBus.subscribe('dependency.status_changed', 
      this.handleDependencyStatusChange.bind(this));
    this.dependencies.eventBus.subscribe('synchronization.point_reached', 
      this.handleSynchronizationPointReached.bind(this));
  }

  private async handleRepositoryStateChange(event: MultiRepoEvent): Promise<void> {
    // Handle repository state changes
    const { repositoryId, newState } = event.payload;
    // Implementation for handling state changes
  }

  private async handleDependencyStatusChange(event: MultiRepoEvent): Promise<void> {
    // Handle dependency status changes
    const { dependencyId, newStatus } = event.payload;
    // Implementation for handling dependency changes
  }

  private async handleSynchronizationPointReached(event: MultiRepoEvent): Promise<void> {
    // Handle synchronization point events
    const { synchronizationPointId, repositoryId } = event.payload;
    // Implementation for handling sync point events
  }

  // Additional helper methods would be implemented here...
  private async validateRepositoriesReadiness(wave: CrossRepositoryWave): Promise<void> {
    // Implementation
  }

  private async setupCommunicationChannels(wave: CrossRepositoryWave): Promise<void> {
    // Implementation
  }

  private async executeRepositoryWave(repositoryId: string, wave: CrossRepositoryWave): Promise<void> {
    // Implementation
  }

  private async notifyWaveInitialization(wave: CrossRepositoryWave): Promise<void> {
    // Implementation
  }

  private async notifyWaveCompletion(wave: CrossRepositoryWave): Promise<void> {
    // Implementation
  }

  private async notifyWaveFailure(wave: CrossRepositoryWave, error: Error): Promise<void> {
    // Implementation
  }

  private async cleanupWaveResources(wave: CrossRepositoryWave): Promise<void> {
    // Implementation
  }

  private calculateThroughput(wave: CrossRepositoryWave): number {
    // Implementation
    return 0;
  }
}

/**
 * Synchronization Manager for cross-repository coordination
 */
export class SynchronizationManager {
  private dependencies: MultiRepoCoordinatorDependencies;
  private activeSyncPoints: Map<string, SynchronizationPoint>;

  constructor(dependencies: MultiRepoCoordinatorDependencies) {
    this.dependencies = dependencies;
    this.activeSyncPoints = new Map();
  }

  async initializeSynchronizationPoints(
    points: SynchronizationPoint[]
  ): Promise<void> {
    for (const point of points) {
      this.activeSyncPoints.set(point.pointId, point);
    }
  }

  async executeSynchronizationPoint(
    syncPoint: SynchronizationPoint,
    participatingRepositories: string[]
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Wait for all repositories to reach the sync point
      const waitPromises = syncPoint.repositories.map(repoId => {
        const client = this.dependencies.repositoryClients.get(repoId);
        return client?.waitForSynchronizationPoint(syncPoint.pointId, syncPoint.timeout);
      });

      const results = await Promise.all(waitPromises);
      const allReached = results.every(result => result === true);

      if (allReached) {
        syncPoint.status = SyncPointStatus.SYNCHRONIZED;
      } else {
        syncPoint.status = SyncPointStatus.TIMEOUT;
      }

      const duration = Date.now() - startTime;
      this.dependencies.metricsCollector.recordSynchronizationTime(
        syncPoint.pointId, 
        duration
      );

    } catch (error) {
      syncPoint.status = SyncPointStatus.FAILED;
      throw error;
    }
  }

  async getSynchronizationStatus(waveId: string): Promise<Map<string, SyncPointStatus>> {
    const status = new Map<string, SyncPointStatus>();
    for (const [pointId, point] of this.activeSyncPoints) {
      status.set(pointId, point.status);
    }
    return status;
  }

  async checkSynchronizationPoints(
    repositoryId: string,
    dependency: CrossRepoDependency
  ): Promise<void> {
    // Check if dependency change affects any sync points
    for (const [_, syncPoint] of this.activeSyncPoints) {
      if (syncPoint.repositories.includes(repositoryId)) {
        // Re-evaluate sync point condition
        // Implementation would check if sync point can now proceed
      }
    }
  }

  async finalSynchronization(
    waveId: string,
    participatingRepositories: string[]
  ): Promise<void> {
    // Perform final synchronization before wave completion
    // Implementation would ensure all repositories are in consistent state
  }
}

/**
 * Cross-Repository Dependency Resolver
 */
export class CrossRepoDependencyResolver {
  private dependencies: MultiRepoCoordinatorDependencies;
  private activeDependencies: Map<string, CrossRepoDependency>;

  constructor(dependencies: MultiRepoCoordinatorDependencies) {
    this.dependencies = dependencies;
    this.activeDependencies = new Map();
  }

  async initializeDependencies(dependencies: CrossRepoDependency[]): Promise<void> {
    for (const dependency of dependencies) {
      const depId = `${dependency.sourceRepository}-${dependency.sourceTask}-${dependency.targetRepository}-${dependency.targetTask}`;
      this.activeDependencies.set(depId, dependency);
      await this.dependencies.persistenceLayer.saveDependency(dependency);
    }
  }

  async updateDependencyStatus(dependency: CrossRepoDependency): Promise<void> {
    const depId = `${dependency.sourceRepository}-${dependency.sourceTask}-${dependency.targetRepository}-${dependency.targetTask}`;
    this.activeDependencies.set(depId, dependency);
    await this.dependencies.persistenceLayer.saveDependency(dependency);
  }

  async getDependencyStatus(waveId: string): Promise<Map<string, CrossDepStatus>> {
    const status = new Map<string, CrossDepStatus>();
    for (const [depId, dependency] of this.activeDependencies) {
      status.set(depId, dependency.status);
    }
    return status;
  }

  async startDependencyTracking(waveId: string): Promise<void> {
    // Start tracking dependency changes
    // Implementation would monitor repository states and update dependencies
  }

  async validateAllDependencies(waveId: string): Promise<void> {
    for (const [depId, dependency] of this.activeDependencies) {
      if (dependency.status !== CrossDepStatus.SATISFIED) {
        throw new MultiRepositoryCoordinationError(
          `Dependency not satisfied: ${depId}`,
          dependency.sourceRepository,
          'validate_dependencies'
        );
      }
    }
  }
}

/**
 * Coordination State Manager
 */
export class CoordinationState {
  private state: Map<string, unknown>;

  constructor() {
    this.state = new Map();
  }

  setState(key: string, value: unknown): void {
    this.state.set(key, value);
  }

  getState<T>(key: string): T | undefined {
    return this.state.get(key) as T;
  }

  hasState(key: string): boolean {
    return this.state.has(key);
  }

  clearState(key: string): void {
    this.state.delete(key);
  }
}

// Additional types for the dashboard
export interface CrossRepoCoordinationDashboard {
  activeWaves: ActiveWaveSummary[];
  repositoryStatuses: Map<string, RepositoryStatus>;
  systemMetrics: SystemMetrics;
  alerts: Alert[];
  performance: PerformanceMetrics;
}

export interface ActiveWaveSummary {
  waveId: string;
  status: CrossRepoWaveStatus;
  progress: number;
  repositoriesCount: number;
  startTime: Date;
  estimatedEndTime: Date;
}

export interface RepositoryStatus {
  repositoryId: string;
  name: string;
  role: RepositoryRole;
  currentWave: number;
  allReady: boolean;
  teamsCount: number;
  lastUpdate: Date;
  health: 'healthy' | 'unhealthy' | 'unknown';
  error?: string;
}

export interface SystemMetrics {
  totalRepositories: number;
  activeCoordinations: number;
  averageCoordinationLatency: number;
  throughput: number;
  errorRate: number;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  source: string;
  timestamp: Date;
}

export interface PerformanceMetrics {
  coordinationLatency: Map<string, number>;
  synchronizationTimes: Map<string, number>;
  dependencyResolutionTimes: Map<string, number>;
}