/**
 * Team Matcher - Intelligent skill-based matching between tasks and teams
 */

import {
  TeamUtilization,
  TeamSkill,
  TaskRequirement,
  Task,
  WorkStealingCandidate,
  WorkStealingError,
  WorkStealingErrorCode
} from '../types/index';

export interface TeamMatcherDependencies {
  getTaskRequirements: (taskId: string) => Promise<TaskRequirement[]>;
  getTeamUtilization: (teamId: string) => Promise<TeamUtilization>;
  getAllTeams: () => Promise<string[]>;
}

export class TeamMatcher {
  constructor(private readonly deps: TeamMatcherDependencies) {}

  /**
   * Finds the best team matches for a given task based on skill requirements
   */
  async findBestMatches(
    task: Task,
    excludeTeam?: string,
    maxCandidates: number = 5
  ): Promise<WorkStealingCandidate[]> {
    try {
      const requirements = await this.deps.getTaskRequirements(task.id);
      const allTeams = await this.deps.getAllTeams();
      const candidateTeams = allTeams.filter(team => team !== excludeTeam);

      const candidates: WorkStealingCandidate[] = [];

      for (const teamId of candidateTeams) {
        const utilization = await this.deps.getTeamUtilization(teamId);
        const skillMatch = this.calculateSkillMatch(requirements, utilization.skills);
        
        if (skillMatch >= 0.5) { // Minimum skill threshold
          const transferCost = this.calculateTransferCost(task, utilization);
          const expectedBenefit = this.calculateExpectedBenefit(task, utilization);
          const dependencyRisk = this.calculateDependencyRisk(task, utilization);

          candidates.push({
            taskId: task.id,
            originalTeam: task.team,
            candidateTeams: [teamId],
            transferCost,
            expectedBenefit,
            dependencyRisk,
            skillMatch
          });
        }
      }

      // Sort by composite score: benefit/cost ratio adjusted for skill match and risk
      return candidates
        .sort((a, b) => {
          const scoreA = this.calculateCompositeScore(a);
          const scoreB = this.calculateCompositeScore(b);
          return scoreB - scoreA;
        })
        .slice(0, maxCandidates);

    } catch (error) {
      throw new WorkStealingError(
        `Failed to find team matches for task ${task.id}`,
        WorkStealingErrorCode.SKILL_MISMATCH,
        { taskId: task.id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Calculates skill compatibility between task requirements and team skills
   */
  private calculateSkillMatch(requirements: TaskRequirement[], teamSkills: TeamSkill[]): number {
    if (requirements.length === 0) {
      return 1.0; // No specific requirements = perfect match
    }

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const requirement of requirements) {
      const matchingSkill = teamSkills.find(skill => skill.skill === requirement.skill);
      
      if (!matchingSkill) {
        // Missing required skill - severe penalty
        return 0;
      }

      const proficiencyMatch = Math.max(0, matchingSkill.proficiency - requirement.minimumProficiency);
      const availabilityFactor = matchingSkill.availability;
      const skillScore = proficiencyMatch * availabilityFactor;
      
      totalWeightedScore += skillScore * requirement.importance;
      totalWeight += requirement.importance;
    }

    return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
  }

  /**
   * Estimates the cost of transferring a task to a different team
   */
  private calculateTransferCost(task: Task, targetUtilization: TeamUtilization): number {
    const baseCost = 0.1; // Base coordination overhead
    
    // Higher cost for teams already at capacity
    const capacityCost = Math.max(0, targetUtilization.utilizationRate - 0.8) * 0.5;
    
    // Critical tasks have higher transfer costs
    const criticalityFactor = task.critical ? 0.2 : 0;
    
    // Dependency complexity increases cost
    const dependencyCost = task.depends_on.length * 0.05;

    return baseCost + capacityCost + criticalityFactor + dependencyCost;
  }

  /**
   * Estimates the expected benefit of transferring a task
   */
  private calculateExpectedBenefit(task: Task, targetUtilization: TeamUtilization): number {
    // Benefit is higher when moving to underutilized teams
    const utilizationBenefit = Math.max(0, 0.8 - targetUtilization.utilizationRate) * 2;
    
    // Critical tasks provide more benefit when moved to capable teams
    const criticalityBenefit = task.critical ? 0.3 : 0.1;
    
    // Teams with spare capacity provide more benefit
    const capacityBenefit = Math.max(0, targetUtilization.capacity - targetUtilization.activeTasks) * 0.1;

    return utilizationBenefit + criticalityBenefit + capacityBenefit;
  }

  /**
   * Assesses the risk of dependency violations when transferring
   */
  private calculateDependencyRisk(task: Task, targetUtilization: TeamUtilization): number {
    // Higher risk if task has many dependencies
    const dependencyComplexity = task.depends_on.length * 0.1;
    
    // Higher risk if target team is already handling many tasks in this wave
    const coordinationRisk = targetUtilization.activeTasks * 0.05;
    
    // Critical tasks carry higher transfer risk
    const criticalityRisk = task.critical ? 0.2 : 0.1;

    return Math.min(1.0, dependencyComplexity + coordinationRisk + criticalityRisk);
  }

  /**
   * Calculates a composite score for ranking candidates
   */
  private calculateCompositeScore(candidate: WorkStealingCandidate): number {
    const benefitCostRatio = candidate.transferCost > 0 
      ? candidate.expectedBenefit / candidate.transferCost 
      : candidate.expectedBenefit;
    
    const skillBonus = candidate.skillMatch * 0.5;
    const riskPenalty = candidate.dependencyRisk * 0.3;
    
    return benefitCostRatio + skillBonus - riskPenalty;
  }

  /**
   * Validates if a team can handle a specific task based on skills and capacity
   */
  async validateTeamCapability(taskId: string, teamId: string): Promise<boolean> {
    try {
      const requirements = await this.deps.getTaskRequirements(taskId);
      const utilization = await this.deps.getTeamUtilization(teamId);

      // Check capacity
      if (utilization.activeTasks >= utilization.capacity) {
        return false;
      }

      // Check skill requirements
      const skillMatch = this.calculateSkillMatch(requirements, utilization.skills);
      return skillMatch >= 0.5; // Minimum threshold for capability

    } catch (error) {
      throw new WorkStealingError(
        `Failed to validate team capability for task ${taskId} and team ${teamId}`,
        WorkStealingErrorCode.SKILL_MISMATCH,
        { taskId, teamId, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Builds a skill compatibility matrix between teams and tasks
   */
  async buildCompatibilityMatrix(
    tasks: Task[],
    teams: string[]
  ): Promise<Map<string, Map<string, number>>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const task of tasks) {
      const taskMatrix = new Map<string, number>();
      const requirements = await this.deps.getTaskRequirements(task.id);

      for (const teamId of teams) {
        if (teamId === task.team) {
          // Current team gets perfect score
          taskMatrix.set(teamId, 1.0);
          continue;
        }

        const utilization = await this.deps.getTeamUtilization(teamId);
        const skillMatch = this.calculateSkillMatch(requirements, utilization.skills);
        taskMatrix.set(teamId, skillMatch);
      }

      matrix.set(task.id, taskMatrix);
    }

    return matrix;
  }

  /**
   * Finds optimal task-team assignments using Hungarian algorithm approach
   */
  async optimizeTaskAssignments(
    tasks: Task[],
    teams: string[]
  ): Promise<Map<string, string>> {
    const compatibilityMatrix = await this.buildCompatibilityMatrix(tasks, teams);
    const assignments = new Map<string, string>();

    // Simple greedy approach for now - can be enhanced with Hungarian algorithm
    const availableTeams = new Set(teams);
    const tasksToAssign = [...tasks].sort((a, b) => {
      // Prioritize critical tasks
      if (a.critical && !b.critical) return -1;
      if (!a.critical && b.critical) return 1;
      // Then by dependency count (more dependencies first)
      return b.depends_on.length - a.depends_on.length;
    });

    for (const task of tasksToAssign) {
      const taskCompatibility = compatibilityMatrix.get(task.id);
      if (!taskCompatibility) continue;

      // Find the best available team for this task
      let bestTeam = '';
      let bestScore = 0;

      for (const teamId of availableTeams) {
        const score = taskCompatibility.get(teamId) || 0;
        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestTeam = teamId;
        }
      }

      if (bestTeam) {
        assignments.set(task.id, bestTeam);
        // Remove team from available set if it's at capacity
        const utilization = await this.deps.getTeamUtilization(bestTeam);
        const assignedTasks = Array.from(assignments.values()).filter(t => t === bestTeam).length;
        if (assignedTasks >= utilization.capacity) {
          availableTeams.delete(bestTeam);
        }
      }
    }

    return assignments;
  }
}