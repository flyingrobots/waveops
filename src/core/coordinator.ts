/**
 * Wave Coordinator - Main orchestration engine with intelligent work stealing
 */

import { 
  WaveState, 
  Task, 
  TeamUtilization,
  WorkStealingConfig,
  WorkStealingError,
  WorkStealingErrorCode
} from '../types/index';
import { ValidationEngine } from './validation-engine';
import { WorkStealingEngine, WorkStealingEngineDependencies } from '../coordination/work-stealing';
import { GitHubClient } from '../github/client';

export interface CoordinatorDependencies {
  githubClient: GitHubClient;
  validationEngine: ValidationEngine;
  getWaveState: () => Promise<WaveState>;
  updateWaveState: (state: WaveState) => Promise<void>;
  getTasks: (wave: number) => Promise<Task[]>;
  updateTaskAssignment: (taskId: string, newTeam: string) => Promise<void>;
  getTeamCapacity: (teamId: string) => Promise<number>;
  getTeamSkills: (teamId: string) => Promise<Array<{skill: string, proficiency: number}>>;
  notifyTeamOfChange: (teamId: string, message: string) => Promise<void>;
}

export interface CoordinationResult {
  success: boolean;
  waveReady: boolean;
  workStealingActive: boolean;
  transfersExecuted: number;
  utilizationImprovement: number;
  errors: string[];
  recommendations: string[];
}

export class WaveCoordinator {
  private workStealingEngine: WorkStealingEngine;
  private readonly config: WorkStealingConfig;

  constructor(
    private readonly deps: CoordinatorDependencies,
    config?: Partial<WorkStealingConfig>
  ) {
    this.config = {
      enabled: true,
      utilizationThreshold: 0.8,
      imbalanceThreshold: 0.3,
      minimumTransferBenefit: 0.15,
      maxTransfersPerWave: 3,
      skillMatchThreshold: 0.6,
      coordinationOverheadWeight: 0.2,
      proactiveStealingEnabled: true,
      emergencyStealingEnabled: true,
      ...config
    };

    // Initialize work stealing engine with dependencies
    const workStealingDeps: WorkStealingEngineDependencies = {
      // Team matcher dependencies
      getTaskRequirements: this.getTaskRequirements.bind(this),
      getTeamUtilization: this.getTeamUtilization.bind(this),
      getAllTeams: this.getAllTeams.bind(this),
      
      // Load balancer dependencies  
      getTasksByWave: this.deps.getTasks,
      estimateTaskDuration: this.estimateTaskDuration.bind(this),
      findTeamMatches: this.findTeamMatches.bind(this),
      
      // Work stealing engine specific
      getWaveState: this.deps.getWaveState,
      updateTaskAssignment: this.updateTaskAssignmentWithValidation.bind(this),
      validateDependencies: this.validateTaskDependencies.bind(this),
      notifyTeamOfTransfer: this.notifyTeamOfTransfer.bind(this),
      logTransferAttempt: this.logTransferAttempt.bind(this),
      acquireCoordinationLock: this.acquireCoordinationLock.bind(this),
      releaseCoordinationLock: this.releaseCoordinationLock.bind(this),
      rollbackTransfer: this.rollbackTaskTransfer.bind(this),
      getTransferHistory: this.getTransferHistory.bind(this)
    };

    this.workStealingEngine = new WorkStealingEngine(workStealingDeps, this.config);
  }

  /**
   * Main coordination method that orchestrates wave progression with work stealing
   */
  async coordinateWave(): Promise<CoordinationResult> {
    const result: CoordinationResult = {
      success: false,
      waveReady: false,
      workStealingActive: false,
      transfersExecuted: 0,
      utilizationImprovement: 0,
      errors: [],
      recommendations: []
    };

    try {
      const waveState = await this.deps.getWaveState();
      const currentWave = waveState.wave;
      
      // First, validate current wave progress
      const validationResult = await this.validateWaveProgress(waveState);
      
      if (!validationResult.success) {
        result.errors.push(...validationResult.errors);
      }

      // Execute work stealing if enabled and needed
      if (this.config.enabled) {
        const stealingMetrics = await this.workStealingEngine.coordinateWorkStealing(currentWave);
        
        result.workStealingActive = stealingMetrics.totalTransfers > 0;
        result.transfersExecuted = stealingMetrics.successfulTransfers;
        result.utilizationImprovement = stealingMetrics.utilizationImprovement;
        
        if (stealingMetrics.failedTransfers > 0) {
          result.errors.push(`${stealingMetrics.failedTransfers} work transfers failed`);
        }
      }

      // Check if wave is ready to advance
      const readinessCheck = await this.checkWaveReadiness(waveState);
      result.waveReady = readinessCheck.ready;
      result.recommendations.push(...readinessCheck.recommendations);

      // Generate system recommendations
      const systemStatus = await this.workStealingEngine.getWorkStealingStatus();
      result.recommendations.push(...systemStatus.recommendations);

      result.success = result.errors.length === 0;
      return result;

    } catch (error) {
      result.errors.push(`Coordination failed: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Manual work claiming interface for teams
   */
  async claimTask(taskId: string, claimingTeam: string): Promise<boolean> {
    try {
      return await this.workStealingEngine.claimTask(taskId, claimingTeam);
    } catch (error) {
      if (error instanceof WorkStealingError) {
        throw error;
      }
      throw new WorkStealingError(
        `Failed to claim task ${taskId}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { taskId, claimingTeam, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Manual work release interface for teams
   */
  async releaseTask(taskId: string, releasingTeam: string): Promise<string> {
    try {
      return await this.workStealingEngine.releaseTask(taskId, releasingTeam);
    } catch (error) {
      if (error instanceof WorkStealingError) {
        throw error;
      }
      throw new WorkStealingError(
        `Failed to release task ${taskId}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { taskId, releasingTeam, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  // Private implementation methods for work stealing dependencies

  private async getTaskRequirements(taskId: string) {
    // Extract requirements from task metadata or GitHub labels
    const tasks = await this.deps.getTasks(0);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Simple requirement extraction - could be enhanced with GitHub label parsing
    const requirements = [];
    if (task.title.toLowerCase().includes('frontend') || task.title.toLowerCase().includes('ui')) {
      requirements.push({ skill: 'frontend', minimumProficiency: 0.6, importance: 1.0 });
    }
    if (task.title.toLowerCase().includes('backend') || task.title.toLowerCase().includes('api')) {
      requirements.push({ skill: 'backend', minimumProficiency: 0.6, importance: 1.0 });
    }
    if (task.title.toLowerCase().includes('devops') || task.title.toLowerCase().includes('deploy')) {
      requirements.push({ skill: 'devops', minimumProficiency: 0.7, importance: 0.8 });
    }
    if (task.title.toLowerCase().includes('mobile')) {
      requirements.push({ skill: 'mobile', minimumProficiency: 0.6, importance: 1.0 });
    }

    return requirements;
  }

  private async getTeamUtilization(teamId: string): Promise<TeamUtilization> {
    const waveState = await this.deps.getWaveState();
    const teamState = waveState.teams[teamId];
    
    if (!teamState) {
      throw new Error(`Team ${teamId} not found`);
    }

    const capacity = await this.deps.getTeamCapacity(teamId);
    const skills = await this.deps.getTeamSkills(teamId);
    const activeTasks = teamState.tasks.length;
    
    return {
      teamId,
      totalTasks: activeTasks,
      activeTasks: teamState.status === 'in_progress' ? activeTasks : 0,
      completedTasks: teamState.status === 'ready' ? activeTasks : 0,
      capacity,
      utilizationRate: capacity > 0 ? activeTasks / capacity : 0,
      estimatedCompletionTime: activeTasks * 2, // Simple estimation
      skills: skills.map(s => ({ ...s, availability: 0.8 }))
    };
  }

  private async getAllTeams(): Promise<string[]> {
    const waveState = await this.deps.getWaveState();
    return Object.keys(waveState.teams);
  }

  private async estimateTaskDuration(taskId: string, teamId: string): Promise<number> {
    // Simple estimation based on task complexity and team proficiency
    const tasks = await this.deps.getTasks(0);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      return 1;
    }

    let complexity = 1;
    if (task.critical) complexity += 0.5;
    if (task.depends_on.length > 0) complexity += task.depends_on.length * 0.2;
    
    return complexity;
  }

  private async findTeamMatches(task: Task, excludeTeam?: string) {
    // This would typically use the TeamMatcher, but for integration we'll simulate
    const allTeams = await this.getAllTeams();
    const candidateTeams = allTeams.filter(t => t !== excludeTeam);
    
    const candidates = [];
    for (const teamId of candidateTeams) {
      const utilization = await this.getTeamUtilization(teamId);
      
      // Simple matching logic
      if (utilization.activeTasks < utilization.capacity) {
        candidates.push({
          taskId: task.id,
          originalTeam: task.team,
          candidateTeams: [teamId],
          transferCost: 0.2,
          expectedBenefit: 0.3,
          dependencyRisk: 0.1,
          skillMatch: 0.7
        });
      }
    }
    
    return candidates;
  }

  private async updateTaskAssignmentWithValidation(taskId: string, newTeam: string): Promise<void> {
    // Update the task assignment and notify teams
    await this.deps.updateTaskAssignment(taskId, newTeam);
    
    const waveState = await this.deps.getWaveState();
    
    // Update wave state to reflect the change
    for (const teamId in waveState.teams) {
      const team = waveState.teams[teamId];
      const taskIndex = team.tasks.indexOf(taskId);
      
      if (taskIndex >= 0 && teamId !== newTeam) {
        // Remove from old team
        team.tasks.splice(taskIndex, 1);
      } else if (teamId === newTeam && taskIndex < 0) {
        // Add to new team
        team.tasks.push(taskId);
      }
    }
    
    await this.deps.updateWaveState(waveState);
    
    // Notify teams of the change
    await this.deps.notifyTeamOfChange(newTeam, `Task ${taskId} has been assigned to your team`);
  }

  private async validateTaskDependencies(taskId: string, newTeam: string): Promise<boolean> {
    const tasks = await this.deps.getTasks(0);
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) {
      return false;
    }

    // Check if all dependencies are satisfied for the new team
    for (const depId of task.depends_on) {
      const depTask = tasks.find(t => t.id === depId);
      if (!depTask) {
        continue;
      }

      // Validate that dependency coordination won't be broken
      if (depTask.team !== newTeam && task.critical) {
        // Critical tasks should stay close to their dependencies
        return false;
      }
    }

    return true;
  }

  private async notifyTeamOfTransfer(request: any): Promise<boolean> {
    // In a real implementation, this would integrate with team notification systems
    await this.deps.notifyTeamOfChange(
      request.toTeam,
      `Work transfer request: Task ${request.taskId} from ${request.fromTeam}`
    );
    
    // Simulate approval process - in practice this would involve team interaction
    return !request.approvalRequired || Math.random() > 0.2; // 80% approval rate
  }

  private async logTransferAttempt(request: any, success: boolean, error?: string): Promise<void> {
    const logMessage = success 
      ? `✅ Successfully transferred task ${request.taskId} from ${request.fromTeam} to ${request.toTeam}`
      : `❌ Failed to transfer task ${request.taskId}: ${error}`;
    
    console.log(`[WorkStealing] ${logMessage}`);
  }

  private locks = new Map<string, string>();
  
  private async acquireCoordinationLock(taskId: string): Promise<string> {
    const lockId = `lock-${taskId}-${Date.now()}`;
    
    // Simple in-memory locking - in production would use distributed locking
    if (this.locks.has(taskId)) {
      throw new Error(`Task ${taskId} is already locked`);
    }
    
    this.locks.set(taskId, lockId);
    return lockId;
  }

  private async releaseCoordinationLock(lockId: string): Promise<void> {
    const taskId = Array.from(this.locks.entries())
      .find(([, id]) => id === lockId)?.[0];
    
    if (taskId) {
      this.locks.delete(taskId);
    }
  }

  private async rollbackTaskTransfer(taskId: string, originalTeam: string): Promise<void> {
    // Rollback the task assignment
    try {
      await this.updateTaskAssignmentWithValidation(taskId, originalTeam);
    } catch (error) {
      console.error(`Failed to rollback task ${taskId} to team ${originalTeam}:`, error);
    }
  }

  private async getTransferHistory(taskId: string): Promise<any[]> {
    // In practice, this would query a database or audit log
    return [];
  }

  // Helper methods for wave coordination

  private async validateWaveProgress(waveState: WaveState) {
    const errors: string[] = [];
    const currentWave = waveState.wave;
    
    // Validate each team's tasks
    for (const [teamId, teamState] of Object.entries(waveState.teams)) {
      if (teamState.status === 'blocked' && teamState.reason) {
        errors.push(`Team ${teamId} blocked: ${teamState.reason}`);
      }
      
      // Validate task completion if team claims to be ready
      if (teamState.status === 'ready' && teamState.tasks.length > 0) {
        const taskValidations = await Promise.all(
          teamState.tasks.map(taskId => 
            this.validateTaskCompletionForTeam(taskId, teamId)
          )
        );
        
        const invalidTasks = taskValidations.filter(v => !v.valid);
        if (invalidTasks.length > 0) {
          errors.push(`Team ${teamId} has invalid tasks: ${invalidTasks.map(v => v.taskId).join(', ')}`);
        }
      }
    }

    return { success: errors.length === 0, errors };
  }

  private async validateTaskCompletionForTeam(taskId: string, teamId: string) {
    // Integration with existing validation engine
    // This is a simplified version - in practice would map tasks to GitHub issues
    return {
      valid: true,
      taskId,
      teamId
    };
  }

  private async checkWaveReadiness(waveState: WaveState) {
    const recommendations: string[] = [];
    
    // Check if all teams are ready
    const allReady = waveState.all_ready;
    
    if (!allReady) {
      const blockedTeams = Object.entries(waveState.teams)
        .filter(([, team]) => team.status !== 'ready')
        .map(([teamId]) => teamId);
      
      recommendations.push(`Waiting for teams: ${blockedTeams.join(', ')}`);
      
      // Check if work stealing could help
      if (this.config.enabled) {
        const status = await this.workStealingEngine.getWorkStealingStatus();
        if (status.systemHealth.utilizationBalance < 0.7) {
          recommendations.push('Consider work rebalancing to improve team utilization');
        }
      }
    }

    return {
      ready: allReady,
      recommendations
    };
  }
}