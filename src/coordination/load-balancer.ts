/**
 * Load Balancer - Advanced algorithms for team utilization calculation and workload rebalancing
 */

import {
  TeamUtilization,
  Task,
  LoadBalanceMetrics,
  WorkStealingCandidate,
  WorkStealingConfig,
  WorkStealingError,
  WorkStealingErrorCode
} from '../types/index';

export interface LoadBalancerDependencies {
  getTeamUtilization: (_teamId: string) => Promise<TeamUtilization>;
  getAllTeams: () => Promise<string[]>;
  getTasksByWave: (_wave: number) => Promise<Task[]>;
  estimateTaskDuration: (_taskId: string, _teamId: string) => Promise<number>;
  findTeamMatches: (_task: Task, _excludeTeam?: string) => Promise<WorkStealingCandidate[]>;
}

export class LoadBalancer {
  constructor(
    private readonly _deps: LoadBalancerDependencies,
    private readonly _config: WorkStealingConfig
  ) {}

  /**
   * Calculates comprehensive load balance metrics across all teams
   */
  async calculateLoadMetrics(wave: number): Promise<LoadBalanceMetrics> {
    try {
      const teams = await this._deps.getAllTeams();
      const utilizations: TeamUtilization[] = [];
      
      for (const teamId of teams) {
        const utilization = await this._deps.getTeamUtilization(teamId);
        utilizations.push(utilization);
      }

      const totalUtilization = this.calculateTotalUtilization(utilizations);
      const utilizationVariance = this.calculateUtilizationVariance(utilizations);
      const bottleneckTeams = this.identifyBottlenecks(utilizations);
      const underutilizedTeams = this.identifyUnderutilized(utilizations);
      
      const tasks = await this._deps.getTasksByWave(wave);
      const recommendedTransfers = await this.generateTransferRecommendations(
        tasks,
        utilizations
      );

      return {
        totalUtilization,
        utilizationVariance,
        bottleneckTeams,
        underutilizedTeams,
        recommendedTransfers
      };

    } catch (error) {
      throw new WorkStealingError(
        `Failed to calculate load metrics for wave ${wave}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { wave, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Identifies teams that are bottlenecks based on utilization thresholds
   */
  private identifyBottlenecks(utilizations: TeamUtilization[]): string[] {
    return utilizations
      .filter(u => u.utilizationRate > this._config.utilizationThreshold)
      .sort((a, b) => b.utilizationRate - a.utilizationRate)
      .map(u => u.teamId);
  }

  /**
   * Identifies underutilized teams that can accept additional work
   */
  private identifyUnderutilized(utilizations: TeamUtilization[]): string[] {
    const avgUtilization = utilizations.reduce((sum, u) => sum + u.utilizationRate, 0) / utilizations.length;
    const underutilizationThreshold = Math.min(avgUtilization - 0.2, 0.6);

    return utilizations
      .filter(u => u.utilizationRate < underutilizationThreshold && u.activeTasks < u.capacity)
      .sort((a, b) => a.utilizationRate - b.utilizationRate)
      .map(u => u.teamId);
  }

  /**
   * Calculates overall system utilization
   */
  private calculateTotalUtilization(utilizations: TeamUtilization[]): number {
    if (utilizations.length === 0) {return 0;}
    
    const totalCapacity = utilizations.reduce((sum, u) => sum + u.capacity, 0);
    const totalActive = utilizations.reduce((sum, u) => sum + u.activeTasks, 0);
    
    return totalCapacity > 0 ? totalActive / totalCapacity : 0;
  }

  /**
   * Calculates variance in utilization across teams
   */
  private calculateUtilizationVariance(utilizations: TeamUtilization[]): number {
    if (utilizations.length <= 1) {return 0;}

    const mean = utilizations.reduce((sum, u) => sum + u.utilizationRate, 0) / utilizations.length;
    const squaredDeviations = utilizations.map(u => Math.pow(u.utilizationRate - mean, 2));
    
    return squaredDeviations.reduce((sum, dev) => sum + dev, 0) / utilizations.length;
  }

  /**
   * Generates intelligent work transfer recommendations
   */
  private async generateTransferRecommendations(
    tasks: Task[],
    utilizations: TeamUtilization[]
  ): Promise<WorkStealingCandidate[]> {
    const recommendations: WorkStealingCandidate[] = [];
    const bottlenecks = this.identifyBottlenecks(utilizations);
    
    if (bottlenecks.length === 0) {
      return recommendations;
    }

    // Find tasks from bottlenecked teams that could be transferred
    const bottleneckTasks = tasks.filter(task => bottlenecks.includes(task.team));
    
    for (const task of bottleneckTasks) {
      const candidates = await this._deps.findTeamMatches(task, task.team);
      
      // Filter candidates that would actually improve load balance
      const viableCandidates = candidates.filter(candidate => {
        const targetTeam = candidate.candidateTeams[0];
        const targetUtilization = utilizations.find(u => u.teamId === targetTeam);
        
        return targetUtilization && 
               targetUtilization.utilizationRate < this._config.utilizationThreshold &&
               candidate.expectedBenefit > this._config.minimumTransferBenefit;
      });

      recommendations.push(...viableCandidates);
    }

    // Sort by expected benefit and limit to max transfers
    return recommendations
      .sort((a, b) => b.expectedBenefit - a.expectedBenefit)
      .slice(0, this._config.maxTransfersPerWave);
  }

  /**
   * Performs proactive load balancing based on predictive analysis
   */
  async performProactiveBalancing(wave: number): Promise<WorkStealingCandidate[]> {
    if (!this._config.proactiveStealingEnabled) {
      return [];
    }

    try {
      const predictions = await this.predictUtilizationTrends(wave);
      
      const proactiveRecommendations: WorkStealingCandidate[] = [];

      // Identify teams that will become bottlenecks soon
      for (const prediction of predictions) {
        if (prediction.predictedUtilization > this._config.utilizationThreshold + 0.1) {
          const tasks = await this._deps.getTasksByWave(wave);
          const teamTasks = tasks.filter(t => t.team === prediction.teamId);
          
          // Find low-priority tasks that could be moved preemptively
          const movableTasks = teamTasks
            .filter(t => !t.critical && t.depends_on.length <= 2)
            .sort((a, b) => a.depends_on.length - b.depends_on.length);

          for (const task of movableTasks.slice(0, 2)) { // Limit proactive moves
            const candidates = await this._deps.findTeamMatches(task, task.team);
            const bestCandidate = candidates[0];
            
            if (bestCandidate && bestCandidate.expectedBenefit > 0.1) {
              proactiveRecommendations.push({
                ...bestCandidate,
                expectedBenefit: bestCandidate.expectedBenefit * 0.7 // Discount proactive benefits
              });
            }
          }
        }
      }

      return proactiveRecommendations
        .sort((a, b) => b.expectedBenefit - a.expectedBenefit)
        .slice(0, Math.floor(this._config.maxTransfersPerWave / 2));

    } catch (error) {
      throw new WorkStealingError(
        `Failed to perform proactive balancing for wave ${wave}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { wave, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Handles emergency rebalancing for critical situations
   */
  async performEmergencyRebalancing(wave: number): Promise<WorkStealingCandidate[]> {
    if (!this._config.emergencyStealingEnabled) {
      return [];
    }

    try {
      const teams = await this._deps.getAllTeams();
      const utilizations: TeamUtilization[] = [];
      
      for (const teamId of teams) {
        const utilization = await this._deps.getTeamUtilization(teamId);
        utilizations.push(utilization);
      }

      // Identify truly critical situations (>95% utilization or blocked critical tasks)
      const emergencyTeams = utilizations.filter(u => 
        u.utilizationRate > 0.95 || 
        (u.utilizationRate > 0.85 && this.hasCriticalTasks(u.teamId, wave))
      );

      if (emergencyTeams.length === 0) {
        return [];
      }

      const emergencyRecommendations: WorkStealingCandidate[] = [];
      const tasks = await this._deps.getTasksByWave(wave);

      for (const emergencyTeam of emergencyTeams) {
        const teamTasks = tasks.filter(t => t.team === emergencyTeam.teamId);
        
        // Prioritize moving non-critical tasks first, then less critical ones
        const tasksByPriority = teamTasks.sort((a, b) => {
          if (a.critical && !b.critical) {return 1;}
          if (!a.critical && b.critical) {return -1;}
          return a.depends_on.length - b.depends_on.length;
        });

        for (const task of tasksByPriority.slice(0, 3)) {
          const candidates = await this._deps.findTeamMatches(task, task.team);
          const bestCandidate = candidates[0];
          
          if (bestCandidate && bestCandidate.skillMatch >= 0.3) { // Lower skill threshold for emergency
            emergencyRecommendations.push({
              ...bestCandidate,
              expectedBenefit: bestCandidate.expectedBenefit * 1.5, // Boost emergency benefits
              transferCost: bestCandidate.transferCost * 0.5 // Reduce cost consideration
            });
          }
        }
      }

      return emergencyRecommendations
        .sort((a, b) => (b.expectedBenefit / b.transferCost) - (a.expectedBenefit / a.transferCost))
        .slice(0, this._config.maxTransfersPerWave);

    } catch (error) {
      throw new WorkStealingError(
        `Failed to perform emergency rebalancing for wave ${wave}`,
        WorkStealingErrorCode.COORDINATION_FAILURE,
        { wave, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Predicts utilization trends based on current state and task complexity
   */
  private async predictUtilizationTrends(wave: number): Promise<Array<{teamId: string, predictedUtilization: number}>> {
    const teams = await this._deps.getAllTeams();
    const tasks = await this._deps.getTasksByWave(wave);
    const predictions: Array<{teamId: string, predictedUtilization: number}> = [];

    for (const teamId of teams) {
      const utilization = await this._deps.getTeamUtilization(teamId);
      const teamTasks = tasks.filter(t => t.team === teamId);
      
      // Estimate future load based on task complexity and dependencies
      let complexityFactor = 0;
      for (const task of teamTasks) {
        const duration = await this._deps.estimateTaskDuration(task.id, teamId);
        const dependencyComplexity = task.depends_on.length * 0.1;
        const criticalityFactor = task.critical ? 1.2 : 1.0;
        
        complexityFactor += duration * (1 + dependencyComplexity) * criticalityFactor;
      }

      // Predict utilization considering team capacity and estimated workload
      const predictedUtilization = utilization.capacity > 0 
        ? Math.min(1.0, (utilization.activeTasks + complexityFactor * 0.1) / utilization.capacity)
        : utilization.utilizationRate;

      predictions.push({
        teamId,
        predictedUtilization
      });
    }

    return predictions;
  }

  /**
   * Checks if a team has critical tasks that could cause bottlenecks
   */
  private async hasCriticalTasks(teamId: string, wave: number): Promise<boolean> {
    const tasks = await this._deps.getTasksByWave(wave);
    return tasks.some(t => t.team === teamId && t.critical);
  }

  /**
   * Calculates the optimal load distribution across teams
   */
  async calculateOptimalDistribution(wave: number): Promise<Map<string, number>> {
    const teams = await this._deps.getAllTeams();
    const tasks = await this._deps.getTasksByWave(wave);
    const utilizations: TeamUtilization[] = [];
    
    for (const teamId of teams) {
      const utilization = await this._deps.getTeamUtilization(teamId);
      utilizations.push(utilization);
    }

    const totalCapacity = utilizations.reduce((sum, u) => sum + u.capacity, 0);
    const totalTasks = tasks.length;
    const distribution = new Map<string, number>();

    for (const utilization of utilizations) {
      // Ideal distribution based on capacity ratio
      const idealTasks = Math.round((utilization.capacity / totalCapacity) * totalTasks);
      distribution.set(utilization.teamId, idealTasks);
    }

    return distribution;
  }

  /**
   * Evaluates the health of the current load distribution
   */
  async evaluateDistributionHealth(wave: number): Promise<{
    healthy: boolean;
    imbalanceScore: number;
    recommendedActions: string[];
  }> {
    const metrics = await this.calculateLoadMetrics(wave);
    
    const imbalanceScore = metrics.utilizationVariance * 10; // Scale for readability
    const healthy = imbalanceScore < this._config.imbalanceThreshold && 
                   metrics.bottleneckTeams.length === 0;

    const recommendedActions: string[] = [];

    if (metrics.bottleneckTeams.length > 0) {
      recommendedActions.push(`Address bottlenecks in teams: ${metrics.bottleneckTeams.join(', ')}`);
    }

    if (metrics.underutilizedTeams.length > 2) {
      recommendedActions.push(`Redistribute work from underutilized teams: ${metrics.underutilizedTeams.slice(0, 2).join(', ')}`);
    }

    if (imbalanceScore > this._config.imbalanceThreshold * 1.5) {
      recommendedActions.push('Consider emergency rebalancing due to high variance');
    }

    if (metrics.recommendedTransfers.length > this._config.maxTransfersPerWave) {
      recommendedActions.push('Implement gradual rebalancing over multiple waves');
    }

    return {
      healthy,
      imbalanceScore,
      recommendedActions
    };
  }
}