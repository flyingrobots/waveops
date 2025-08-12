/**
 * Work Stealing Engine - Main orchestration system for automatic workload rebalancing
 */

import {
  Task,
  TeamUtilization,
  WorkTransferRequest,
  WorkStealingCandidate,
  WorkStealingConfig,
  WorkStealingReason,
  TransferImpact,
  LoadBalanceMetrics,
  WorkStealingError,
  WorkStealingErrorCode,
  WaveState
} from '../types/index';
import { TeamMatcher, TeamMatcherDependencies } from './team-matcher';
import { LoadBalancer, LoadBalancerDependencies } from './load-balancer';

export interface WorkStealingEngineDependencies extends TeamMatcherDependencies, LoadBalancerDependencies {
  getWaveState: () => Promise<WaveState>;
  updateTaskAssignment: (taskId: string, newTeam: string) => Promise<void>;
  validateDependencies: (taskId: string, newTeam: string) => Promise<boolean>;
  notifyTeamOfTransfer: (request: WorkTransferRequest) => Promise<boolean>;
  logTransferAttempt: (request: WorkTransferRequest, success: boolean, error?: string) => Promise<void>;
  acquireCoordinationLock: (taskId: string) => Promise<string>;
  releaseCoordinationLock: (lockId: string) => Promise<void>;
  rollbackTransfer: (taskId: string, originalTeam: string) => Promise<void>;
  getTransferHistory: (taskId: string) => Promise<WorkTransferRequest[]>;
}

export interface WorkStealingMetrics {
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  averageTransferTime: number;
  utilizationImprovement: number;
  coordinationOverhead: number;
}

export class WorkStealingEngine {
  private readonly teamMatcher: TeamMatcher;
  private readonly loadBalancer: LoadBalancer;
  private readonly transferHistory = new Map<string, WorkTransferRequest[]>();
  private isRebalancing = false;

  constructor(
    private readonly deps: WorkStealingEngineDependencies,
    private readonly config: WorkStealingConfig
  ) {
    this.teamMatcher = new TeamMatcher(deps);
    this.loadBalancer = new LoadBalancer(deps, config);
  }

  /**
   * Main entry point for intelligent work stealing coordination
   */
  async coordinateWorkStealing(wave: number): Promise<WorkStealingMetrics> {
    if (!this.config.enabled || this.isRebalancing) {
      return this.createEmptyMetrics();
    }

    this.isRebalancing = true;
    const startTime = Date.now();

    try {
      const initialMetrics = await this.loadBalancer.calculateLoadMetrics(wave);
      const distributionHealth = await this.loadBalancer.evaluateDistributionHealth(wave);

      if (distributionHealth.healthy) {
        return this.createEmptyMetrics();
      }

      // Execute different stealing strategies based on situation
      const proactiveTransfers = await this.executeProactiveStrategy(wave);
      const reactiveTransfers = await this.executeReactiveStrategy(wave);
      const emergencyTransfers = await this.executeEmergencyStrategy(wave);

      const allTransfers = [...proactiveTransfers, ...reactiveTransfers, ...emergencyTransfers];
      const executionResults = await this.executeTransfers(allTransfers);

      const finalMetrics = await this.loadBalancer.calculateLoadMetrics(wave);
      const utilizationImprovement = this.calculateUtilizationImprovement(initialMetrics, finalMetrics);

      return {
        totalTransfers: executionResults.length,
        successfulTransfers: executionResults.filter(r => r.success).length,
        failedTransfers: executionResults.filter(r => !r.success).length,
        averageTransferTime: (Date.now() - startTime) / Math.max(executionResults.length, 1),
        utilizationImprovement,
        coordinationOverhead: this.calculateCoordinationOverhead(executionResults)
      };

    } catch (error) {
      throw new WorkStealingError(
        `Work stealing coordination failed for wave ${wave}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { wave, error: error instanceof Error ? error.message : String(error) }
      );
    } finally {
      this.isRebalancing = false;
    }
  }

  /**
   * Executes proactive work stealing based on predictive analysis
   */
  private async executeProactiveStrategy(wave: number): Promise<WorkTransferRequest[]> {
    if (!this.config.proactiveStealingEnabled) {
      return [];
    }

    try {
      const candidates = await this.loadBalancer.performProactiveBalancing(wave);
      return this.convertCandidatesToRequests(candidates, WorkStealingReason.PROACTIVE_OPTIMIZATION);

    } catch (error) {
      await this.deps.logTransferAttempt(
        { taskId: 'proactive-strategy', fromTeam: 'system', toTeam: 'system', reason: WorkStealingReason.PROACTIVE_OPTIMIZATION, estimatedImpact: this.createEmptyImpact(), approvalRequired: false },
        false,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Executes reactive work stealing in response to detected imbalances
   */
  private async executeReactiveStrategy(wave: number): Promise<WorkTransferRequest[]> {
    try {
      const metrics = await this.loadBalancer.calculateLoadMetrics(wave);
      
      if (metrics.bottleneckTeams.length === 0) {
        return [];
      }

      const candidates = metrics.recommendedTransfers;
      return this.convertCandidatesToRequests(candidates, WorkStealingReason.CAPACITY_IMBALANCE);

    } catch (error) {
      await this.deps.logTransferAttempt(
        { taskId: 'reactive-strategy', fromTeam: 'system', toTeam: 'system', reason: WorkStealingReason.CAPACITY_IMBALANCE, estimatedImpact: this.createEmptyImpact(), approvalRequired: false },
        false,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Executes emergency work stealing for critical situations
   */
  private async executeEmergencyStrategy(wave: number): Promise<WorkTransferRequest[]> {
    if (!this.config.emergencyStealingEnabled) {
      return [];
    }

    try {
      const candidates = await this.loadBalancer.performEmergencyRebalancing(wave);
      return this.convertCandidatesToRequests(candidates, WorkStealingReason.EMERGENCY_REBALANCING);

    } catch (error) {
      await this.deps.logTransferAttempt(
        { taskId: 'emergency-strategy', fromTeam: 'system', toTeam: 'system', reason: WorkStealingReason.EMERGENCY_REBALANCING, estimatedImpact: this.createEmptyImpact(), approvalRequired: false },
        false,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Converts work stealing candidates to transfer requests
   */
  private convertCandidatesToRequests(
    candidates: WorkStealingCandidate[],
    reason: WorkStealingReason
  ): WorkTransferRequest[] {
    return candidates.map(candidate => ({
      taskId: candidate.taskId,
      fromTeam: candidate.originalTeam,
      toTeam: candidate.candidateTeams[0],
      reason,
      estimatedImpact: {
        originalTeamDelayReduction: candidate.expectedBenefit * 0.7,
        targetTeamDelayIncrease: candidate.transferCost * 0.5,
        overallThroughputGain: candidate.expectedBenefit - candidate.transferCost,
        coordinationOverhead: candidate.transferCost * 0.3,
        riskFactor: candidate.dependencyRisk
      },
      approvalRequired: reason === WorkStealingReason.EMERGENCY_REBALANCING ? false : 
                       candidate.dependencyRisk > 0.7 || candidate.transferCost > 0.5
    }));
  }

  /**
   * Executes a batch of transfer requests with coordination safety
   */
  private async executeTransfers(requests: WorkTransferRequest[]): Promise<Array<{request: WorkTransferRequest, success: boolean, error?: string}>> {
    const results: Array<{request: WorkTransferRequest, success: boolean, error?: string}> = [];

    // Sort by priority: emergency first, then by expected benefit
    const sortedRequests = requests.sort((a, b) => {
      if (a.reason === WorkStealingReason.EMERGENCY_REBALANCING && b.reason !== WorkStealingReason.EMERGENCY_REBALANCING) {
        return -1;
      }
      if (b.reason === WorkStealingReason.EMERGENCY_REBALANCING && a.reason !== WorkStealingReason.EMERGENCY_REBALANCING) {
        return 1;
      }
      return b.estimatedImpact.overallThroughputGain - a.estimatedImpact.overallThroughputGain;
    });

    for (const request of sortedRequests) {
      const result = await this.executeSingleTransfer(request);
      results.push(result);

      // Stop if we hit too many failures (coordination is likely broken)
      const failureRate = results.filter(r => !r.success).length / results.length;
      if (results.length >= 3 && failureRate > 0.5) {
        break;
      }
    }

    return results;
  }

  /**
   * Executes a single work transfer with full coordination safety
   */
  private async executeSingleTransfer(request: WorkTransferRequest): Promise<{request: WorkTransferRequest, success: boolean, error?: string}> {
    let lockId: string | null = null;

    try {
      // Acquire coordination lock to prevent race conditions
      lockId = await this.deps.acquireCoordinationLock(request.taskId);

      // Validate transfer is still viable
      const isValid = await this.validateTransfer(request);
      if (!isValid) {
        return { request, success: false, error: 'Transfer no longer viable' };
      }

      // Check for approval if required
      if (request.approvalRequired) {
        const approved = await this.deps.notifyTeamOfTransfer(request);
        if (!approved) {
          return { request, success: false, error: 'Transfer not approved by team' };
        }
      }

      // Validate dependencies won't be broken
      const dependenciesValid = await this.deps.validateDependencies(request.taskId, request.toTeam);
      if (!dependenciesValid) {
        return { request, success: false, error: 'Dependency validation failed' };
      }

      // Execute the transfer
      await this.deps.updateTaskAssignment(request.taskId, request.toTeam);

      // Record successful transfer
      this.recordTransferHistory(request);
      await this.deps.logTransferAttempt(request, true);

      return { request, success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Attempt rollback on failure
      try {
        await this.deps.rollbackTransfer(request.taskId, request.fromTeam);
      } catch (rollbackError) {
        // Log rollback failure but don't throw - original error is more important
        await this.deps.logTransferAttempt(request, false, `Transfer failed: ${errorMessage}, Rollback failed: ${rollbackError}`);
      }

      await this.deps.logTransferAttempt(request, false, errorMessage);
      return { request, success: false, error: errorMessage };

    } finally {
      if (lockId) {
        try {
          await this.deps.releaseCoordinationLock(lockId);
        } catch (error) {
          // Log but don't throw - lock will expire eventually
          // Failed to release coordination lock - will expire eventually
        }
      }
    }
  }

  /**
   * Validates that a transfer request is still viable
   */
  private async validateTransfer(request: WorkTransferRequest): Promise<boolean> {
    try {
      // Check if task still exists and is assigned to the expected team
      const tasks = await this.deps.getTasksByWave(0); // Get current wave tasks
      const task = tasks.find(t => t.id === request.taskId);
      
      if (!task || task.team !== request.fromTeam) {
        return false;
      }

      // Validate target team still has capacity
      const targetUtilization = await this.deps.getTeamUtilization(request.toTeam);
      if (targetUtilization.activeTasks >= targetUtilization.capacity) {
        return false;
      }

      // Check if task hasn't been transferred too many times recently
      const history = this.transferHistory.get(request.taskId) || [];
      const recentTransfers = history.filter(h => Date.now() - new Date(h.estimatedImpact.toString()).getTime() < 3600000); // 1 hour
      
      return recentTransfers.length < 3; // Max 3 transfers per hour

    } catch (error) {
      return false;
    }
  }

  /**
   * Records transfer history for audit and preventing excessive transfers
   */
  private recordTransferHistory(request: WorkTransferRequest): void {
    const history = this.transferHistory.get(request.taskId) || [];
    history.push(request);
    
    // Keep only last 10 transfers per task
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
    
    this.transferHistory.set(request.taskId, history);
  }

  /**
   * Manual work stealing interface for team-initiated requests
   */
  async claimTask(taskId: string, claimingTeam: string): Promise<boolean> {
    try {
      const tasks = await this.deps.getTasksByWave(0);
      const task = tasks.find(t => t.id === taskId);
      
      if (!task) {
        throw new WorkStealingError(
          `Task ${taskId} not found`,
          WorkStealingErrorCode.DEPENDENCY_VIOLATION,
          { taskId }
        );
      }

      // Validate team capability
      const canHandle = await this.teamMatcher.validateTeamCapability(taskId, claimingTeam);
      if (!canHandle) {
        throw new WorkStealingError(
          `Team ${claimingTeam} cannot handle task ${taskId}`,
          WorkStealingErrorCode.SKILL_MISMATCH,
          { taskId, claimingTeam }
        );
      }

      // Create transfer request
      const request: WorkTransferRequest = {
        taskId,
        fromTeam: task.team,
        toTeam: claimingTeam,
        reason: WorkStealingReason.CAPACITY_IMBALANCE,
        estimatedImpact: this.createEmptyImpact(),
        approvalRequired: true
      };

      const result = await this.executeSingleTransfer(request);
      return result.success;

    } catch (error) {
      throw new WorkStealingError(
        `Failed to claim task ${taskId} for team ${claimingTeam}`,
        WorkStealingErrorCode.TRANSFER_REJECTED,
        { taskId, claimingTeam, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Releases a task back to the original team or reassigns to optimal team
   */
  async releaseTask(taskId: string, releasingTeam: string): Promise<string> {
    try {
      const tasks = await this.deps.getTasksByWave(0);
      const task = tasks.find(t => t.id === taskId);
      
      if (!task || task.team !== releasingTeam) {
        throw new WorkStealingError(
          `Task ${taskId} not found or not assigned to team ${releasingTeam}`,
          WorkStealingErrorCode.DEPENDENCY_VIOLATION,
          { taskId, releasingTeam }
        );
      }

      // Find optimal reassignment
      const candidates = await this.teamMatcher.findBestMatches(task, releasingTeam);
      const bestCandidate = candidates[0];

      if (!bestCandidate) {
        throw new WorkStealingError(
          `No suitable team found for task ${taskId}`,
          WorkStealingErrorCode.SKILL_MISMATCH,
          { taskId }
        );
      }

      const newTeam = bestCandidate.candidateTeams[0];
      
      const request: WorkTransferRequest = {
        taskId,
        fromTeam: releasingTeam,
        toTeam: newTeam,
        reason: WorkStealingReason.CAPACITY_IMBALANCE,
        estimatedImpact: this.createEmptyImpact(),
        approvalRequired: false
      };

      const result = await this.executeSingleTransfer(request);
      
      if (!result.success) {
        throw new WorkStealingError(
          `Failed to release task ${taskId}: ${result.error}`,
          WorkStealingErrorCode.TRANSFER_REJECTED,
          { taskId, error: result.error }
        );
      }

      return newTeam;

    } catch (error) {
      throw new WorkStealingError(
        `Failed to release task ${taskId} from team ${releasingTeam}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { taskId, releasingTeam, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Gets comprehensive work stealing metrics and status
   */
  async getWorkStealingStatus(): Promise<{
    isActive: boolean;
    recentTransfers: number;
    systemHealth: {
      utilizationBalance: number;
      coordinationEfficiency: number;
      transferSuccessRate: number;
    };
    recommendations: string[];
  }> {
    const allHistory = Array.from(this.transferHistory.values()).flat();
    const recentTransfers = allHistory.filter(h => 
      Date.now() - new Date(h.estimatedImpact.toString()).getTime() < 3600000
    ).length;

    const metrics = await this.loadBalancer.calculateLoadMetrics(0); // Current wave
    
    return {
      isActive: this.isRebalancing,
      recentTransfers,
      systemHealth: {
        utilizationBalance: 1 - Math.min(1, metrics.utilizationVariance * 2),
        coordinationEfficiency: this.calculateCoordinationEfficiency(),
        transferSuccessRate: this.calculateTransferSuccessRate()
      },
      recommendations: await this.generateSystemRecommendations()
    };
  }

  // Helper methods
  private createEmptyMetrics(): WorkStealingMetrics {
    return {
      totalTransfers: 0,
      successfulTransfers: 0,
      failedTransfers: 0,
      averageTransferTime: 0,
      utilizationImprovement: 0,
      coordinationOverhead: 0
    };
  }

  private createEmptyImpact(): TransferImpact {
    return {
      originalTeamDelayReduction: 0,
      targetTeamDelayIncrease: 0,
      overallThroughputGain: 0,
      coordinationOverhead: 0,
      riskFactor: 0
    };
  }

  private calculateUtilizationImprovement(initial: LoadBalanceMetrics, final: LoadBalanceMetrics): number {
    const initialImbalance = initial.utilizationVariance;
    const finalImbalance = final.utilizationVariance;
    
    return Math.max(0, (initialImbalance - finalImbalance) / Math.max(initialImbalance, 0.01));
  }

  private calculateCoordinationOverhead(results: Array<{request: WorkTransferRequest, success: boolean}>): number {
    return results.reduce((sum, r) => sum + r.request.estimatedImpact.coordinationOverhead, 0);
  }

  private calculateCoordinationEfficiency(): number {
    // Simplified efficiency calculation - can be enhanced with more metrics
    return 0.85;
  }

  private calculateTransferSuccessRate(): number {
    const allHistory = Array.from(this.transferHistory.values()).flat();
    if (allHistory.length === 0) {return 1.0;}
    
    const recentHistory = allHistory.slice(-20); // Last 20 transfers
    return recentHistory.length; // Placeholder - would track success/failure in real implementation
  }

  private async generateSystemRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    const metrics = await this.loadBalancer.calculateLoadMetrics(0);
    
    if (metrics.utilizationVariance > this.config.imbalanceThreshold) {
      recommendations.push('High utilization variance detected - consider enabling proactive rebalancing');
    }
    
    if (metrics.bottleneckTeams.length > 2) {
      recommendations.push('Multiple bottleneck teams - review team capacities and skill distributions');
    }
    
    if (metrics.underutilizedTeams.length > 3) {
      recommendations.push('Many underutilized teams - consider consolidating work assignments');
    }

    return recommendations;
  }
}