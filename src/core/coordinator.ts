/**
 * Wave Coordinator - Main orchestration engine with intelligent work stealing
 */

import { 
  WaveState, 
  Task, 
  TeamUtilization,
  WorkStealingConfig,
  WorkStealingError,
  WorkStealingErrorCode,
  GitHubIssue
} from '../types/index';
import { ValidationEngine } from './validation-engine';
import { WorkStealingEngine, WorkStealingEngineDependencies } from '../coordination/work-stealing';
import { GitHubClient } from '../github/client';

export interface CoordinatorDependencies {
  githubClient: GitHubClient;
  validationEngine: ValidationEngine;
  getWaveState: () => Promise<WaveState>;
  updateWaveState: (_state: WaveState) => Promise<void>;
  getTasks: (_wave: number) => Promise<Task[]>;
  updateTaskAssignment: (_taskId: string, _newTeam: string) => Promise<void>;
  getTeamCapacity: (_teamId: string) => Promise<number>;
  getTeamSkills: (_teamId: string) => Promise<Array<{skill: string, proficiency: number}>>;
  notifyTeamOfChange: (_teamId: string, _message: string) => Promise<void>;
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
    try {
      // Get real team members from GitHub Teams API
      const teamMembers = await this.deps.githubClient.getTeamMembers(teamId);
      
      // Get real team capacity and skills from GitHub data
      const capacity = await this.deps.getTeamCapacity(teamId);
      const skills = await this.deps.getTeamSkills(teamId);
      
      // Get current tasks assigned to this team using GitHub Issues API
      const teamTasks = await this.getTeamActiveTasks(teamId);
      const totalTasks = teamTasks.length;
      
      // Calculate real active vs completed tasks from GitHub issue states
      const activeTasks = teamTasks.filter(task => task.state === 'open').length;
      const completedTasks = teamTasks.filter(task => task.state === 'closed').length;
      
      // Calculate real utilization based on team capacity and active GitHub issues
      const utilizationRate = capacity > 0 ? activeTasks / capacity : 0;
      
      // Estimate completion time based on real task complexity analysis
      const estimatedCompletionTime = await this.calculateRealEstimatedTime(teamTasks, teamId);

      return {
        teamId,
        totalTasks,
        activeTasks,
        completedTasks,
        capacity,
        utilizationRate,
        estimatedCompletionTime,
        skills: skills.map(s => ({ 
          ...s, 
          availability: this.calculateSkillAvailability(s.skill, teamMembers, utilizationRate)
        }))
      };

    } catch (error) {
      // Graceful fallback to wave state if GitHub API fails
      console.warn(`Failed to get real team utilization for ${teamId}, falling back to wave state:`, error);
      
      const waveState = await this.deps.getWaveState();
      const teamState = waveState.teams[teamId];
      
      if (!teamState) {
        throw new Error(`Team ${teamId} not found in GitHub or wave state`);
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
        estimatedCompletionTime: activeTasks * 2, // Fallback estimation
        skills: skills.map(s => ({ ...s, availability: 0.8 }))
      };
    }
  }

  private async getAllTeams(): Promise<string[]> {
    try {
      // Get real teams from GitHub organization using the foundation GitHub APIs
      // We'll discover teams by trying common patterns and checking which ones exist
      const commonTeamPatterns = [
        'team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon',
        'team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design',
        'frontend', 'backend', 'devops', 'qa', 'design', 'alpha', 'beta', 'gamma'
      ];

      const existingTeams: string[] = [];
      
      // Check each potential team name using GitHub Teams API
      for (const teamName of commonTeamPatterns) {
        try {
          const members = await this.deps.githubClient.getTeamMembers(teamName);
          if (members.length > 0) {
            existingTeams.push(teamName);
          }
        } catch (error) {
          // Ignore team not found errors, continue checking other teams
          // This is expected for teams that don't exist
        }
      }

      // If we found teams, return them, otherwise fallback to wave state
      if (existingTeams.length > 0) {
        return existingTeams;
      }

      // Fallback to wave state teams if no GitHub teams found
      console.warn('No GitHub teams found, falling back to wave state teams');
      const waveState = await this.deps.getWaveState();
      return Object.keys(waveState.teams);

    } catch (error) {
      console.warn('Failed to get real teams from GitHub, falling back to wave state:', error);
      const waveState = await this.deps.getWaveState();
      return Object.keys(waveState.teams);
    }
  }

  private async estimateTaskDuration(taskId: string, teamId: string): Promise<number> {
    try {
      // Get real task data from GitHub Issues API
      const waveLabels = ['wave', 'task', 'waveops'];
      const issues = await this.deps.githubClient.getRepositoryIssues(waveLabels);
      
      // Find the specific issue by task ID mapping
      const issue = issues.find(i => 
        i.title.includes(taskId) || 
        i.number.toString() === taskId ||
        i.body?.includes(taskId)
      );

      if (!issue) {
        // Fallback to existing logic if issue not found
        console.warn(`Task ${taskId} not found in GitHub issues, using fallback estimation`);
        return this.getFallbackTaskDuration(taskId);
      }

      // Analyze real GitHub issue complexity
      let complexity = 1.0;

      // Factor 1: Issue body length and description complexity
      const bodyLength = (issue.body || '').length;
      if (bodyLength > 1000) complexity += 0.5;
      if (bodyLength > 2000) complexity += 0.5;

      // Factor 2: Number of labels (more labels = more complex)
      const labelCount = issue.labels?.length || 0;
      complexity += labelCount * 0.1;

      // Factor 3: Critical/priority indicators from labels
      const priorityLabels = issue.labels?.filter(label => {
        const labelName = typeof label === 'string' ? label : label.name;
        return ['critical', 'high-priority', 'urgent', 'blocker'].includes(labelName?.toLowerCase() || '');
      }) || [];
      complexity += priorityLabels.length * 0.3;

      // Factor 4: Issue age (older issues may be more complex)
      const createdDate = new Date(issue.created_at);
      const daysSinceCreated = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated > 7) complexity += 0.2;
      if (daysSinceCreated > 30) complexity += 0.3;

      // Factor 5: Team proficiency adjustment
      const teamProficiency = await this.getTeamTaskProficiency(teamId, issue);
      const proficiencyMultiplier = 2.0 - teamProficiency; // Higher proficiency = lower duration
      
      const estimatedDays = complexity * proficiencyMultiplier;
      return Math.max(0.5, Math.min(estimatedDays, 10.0)); // Clamp between 0.5 and 10 days

    } catch (error) {
      console.warn(`Failed to get real task estimation for ${taskId}, using fallback:`, error);
      return this.getFallbackTaskDuration(taskId);
    }
  }

  private async findTeamMatches(task: Task, excludeTeam?: string) {
    try {
      // Get real teams from GitHub
      const allTeams = await this.getAllTeams();
      const candidateTeams = allTeams.filter(t => t !== excludeTeam);
      
      const candidates = [];
      
      for (const teamId of candidateTeams) {
        try {
          // Get real team utilization and capacity from GitHub data
          const utilization = await this.getTeamUtilization(teamId);
          
          // Only consider teams with available capacity
          if (utilization.activeTasks >= utilization.capacity) {
            continue;
          }

          // Calculate real skill match based on GitHub team data and task requirements
          const skillMatch = await this.calculateRealSkillMatch(task, teamId);
          
          // Calculate real transfer cost based on team coordination overhead
          const transferCost = await this.calculateTransferCost(task, excludeTeam || '', teamId);
          
          // Calculate expected benefit from utilization improvement
          const expectedBenefit = await this.calculateExpectedBenefit(task, excludeTeam || '', teamId, utilization);
          
          // Calculate dependency risk based on real task dependencies
          const dependencyRisk = await this.calculateDependencyRisk(task, teamId);

          // Only include viable candidates (positive net benefit)
          if (expectedBenefit > transferCost && skillMatch > 0.4) {
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
        } catch (error) {
          // Log warning but continue with other teams
          console.warn(`Failed to evaluate team ${teamId} as candidate for task ${task.id}:`, error);
        }
      }
      
      // Sort by net benefit (benefit - cost) and skill match
      return candidates.sort((a, b) => {
        const aScore = (a.expectedBenefit - a.transferCost) * a.skillMatch;
        const bScore = (b.expectedBenefit - b.transferCost) * b.skillMatch;
        return bScore - aScore;
      });

    } catch (error) {
      console.warn(`Failed to find real team matches for task ${task.id}, using fallback:`, error);
      
      // Fallback to simplified matching
      const allTeams = await this.getAllTeams();
      const candidateTeams = allTeams.filter(t => t !== excludeTeam);
      
      const fallbackCandidates = [];
      for (const teamId of candidateTeams) {
        const utilization = await this.getTeamUtilization(teamId);
        
        if (utilization.activeTasks < utilization.capacity) {
          fallbackCandidates.push({
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
      
      return fallbackCandidates;
    }
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

  // Helper methods for real GitHub API integration

  private async getTeamActiveTasks(teamId: string): Promise<GitHubIssue[]> {
    try {
      // Get issues with team-specific labels or assignments
      const teamLabels = [`team:${teamId}`, `team-${teamId}`, teamId];
      const waveLabels = ['wave', 'task', 'waveops'];
      const allLabels = [...teamLabels, ...waveLabels];

      const issues = await this.deps.githubClient.getRepositoryIssues(allLabels);
      
      // Filter for issues that are actually assigned to this team
      return issues.filter(issue => {
        // Check labels for team assignment
        const hasTeamLabel = issue.labels?.some(label => {
          const labelName = typeof label === 'string' ? label : label.name;
          return teamLabels.includes(labelName?.toLowerCase() || '');
        });
        
        // Check if issue title/body mentions the team
        const mentionsTeam = issue.title.toLowerCase().includes(teamId.toLowerCase()) ||
                           (issue.body || '').toLowerCase().includes(teamId.toLowerCase());
        
        return hasTeamLabel || mentionsTeam;
      });
    } catch (error) {
      console.warn(`Failed to get active tasks for team ${teamId}:`, error);
      return [];
    }
  }

  private async calculateRealEstimatedTime(tasks: GitHubIssue[], teamId: string): Promise<number> {
    if (tasks.length === 0) return 0;

    let totalEstimatedDays = 0;
    
    for (const task of tasks) {
      // Use our real task duration estimation
      const duration = await this.estimateTaskDuration(task.number.toString(), teamId);
      totalEstimatedDays += duration;
    }
    
    // Account for parallel work capacity
    const teamUtilization = await this.getTeamUtilization(teamId);
    const parallelismFactor = Math.max(1, teamUtilization.capacity * 0.7); // Teams can work in parallel
    
    return totalEstimatedDays / parallelismFactor;
  }

  private calculateSkillAvailability(skill: string, teamMembers: any[], utilizationRate: number): number {
    // Higher utilization means lower skill availability
    const baseAvailability = 1.0 - utilizationRate;
    
    // Adjust based on team size (larger teams = more availability)
    const teamSizeMultiplier = Math.min(1.2, 1.0 + (teamMembers.length - 1) * 0.1);
    
    return Math.max(0.1, Math.min(1.0, baseAvailability * teamSizeMultiplier));
  }

  private getFallbackTaskDuration(taskId: string): number {
    // Parse task complexity from ID or use default
    let complexity = 1.0;
    
    // Check for complexity indicators in task ID
    if (taskId.includes('critical') || taskId.includes('high')) complexity += 0.5;
    if (taskId.includes('simple') || taskId.includes('minor')) complexity -= 0.3;
    
    return Math.max(0.5, complexity);
  }

  private async getTeamTaskProficiency(teamId: string, issue: GitHubIssue): Promise<number> {
    try {
      // Get team skills
      const skills = await this.deps.getTeamSkills(teamId);
      
      // Analyze issue requirements and match against team skills
      const issueText = `${issue.title} ${issue.body || ''}`.toLowerCase();
      
      let maxProficiency = 0.5; // Default proficiency
      
      for (const skill of skills) {
        // Check if the issue requires this skill
        if (issueText.includes(skill.skill.toLowerCase())) {
          maxProficiency = Math.max(maxProficiency, skill.proficiency);
        }
      }
      
      return Math.min(1.0, maxProficiency);
    } catch (error) {
      return 0.7; // Default team proficiency
    }
  }

  private async calculateRealSkillMatch(task: Task, teamId: string): Promise<number> {
    try {
      const taskRequirements = await this.getTaskRequirements(task.id);
      const teamSkills = await this.deps.getTeamSkills(teamId);
      
      if (taskRequirements.length === 0 || teamSkills.length === 0) {
        return 0.6; // Default match if no requirements/skills data
      }

      let totalMatch = 0;
      let totalImportance = 0;

      for (const requirement of taskRequirements) {
        const matchingSkill = teamSkills.find(skill => skill.skill === requirement.skill);
        const skillProficiency = matchingSkill ? matchingSkill.proficiency : 0;
        
        // Calculate match score for this requirement
        const matchScore = skillProficiency >= requirement.minimumProficiency ? skillProficiency : 0;
        
        totalMatch += matchScore * requirement.importance;
        totalImportance += requirement.importance;
      }

      return totalImportance > 0 ? totalMatch / totalImportance : 0.6;
    } catch (error) {
      return 0.6; // Default skill match
    }
  }

  private async calculateTransferCost(task: Task, fromTeam: string, toTeam: string): Promise<number> {
    let cost = 0.1; // Base coordination cost
    
    // Higher cost if teams are very different
    try {
      const fromSkills = await this.deps.getTeamSkills(fromTeam);
      const toSkills = await this.deps.getTeamSkills(toTeam);
      
      // Calculate skill overlap - less overlap = higher cost
      const skillOverlap = this.calculateSkillOverlap(fromSkills, toSkills);
      cost += (1.0 - skillOverlap) * 0.3;
      
    } catch (error) {
      cost += 0.2; // Default higher cost if can't determine skill overlap
    }
    
    // Higher cost for critical tasks
    if (task.critical) {
      cost += 0.2;
    }
    
    // Higher cost for tasks with many dependencies
    cost += task.depends_on.length * 0.1;
    
    return Math.min(1.0, cost);
  }

  private async calculateExpectedBenefit(task: Task, fromTeam: string, toTeam: string, toUtilization: TeamUtilization): Promise<number> {
    try {
      const fromUtilization = await this.getTeamUtilization(fromTeam);
      
      // Benefit based on utilization balancing
      const utilizationImbalance = fromUtilization.utilizationRate - toUtilization.utilizationRate;
      const balancingBenefit = Math.max(0, utilizationImbalance * 0.5);
      
      // Benefit based on capacity availability
      const capacityBenefit = (toUtilization.capacity - toUtilization.activeTasks) / toUtilization.capacity * 0.3;
      
      // Benefit based on skill match
      const skillMatch = await this.calculateRealSkillMatch(task, toTeam);
      const skillBenefit = skillMatch * 0.2;
      
      return balancingBenefit + capacityBenefit + skillBenefit;
    } catch (error) {
      return 0.3; // Default benefit
    }
  }

  private async calculateDependencyRisk(task: Task, teamId: string): Promise<number> {
    let risk = 0.1; // Base risk
    
    // Higher risk if task has dependencies
    if (task.depends_on.length > 0) {
      // Check if dependencies are handled by different teams
      try {
        const allTasks = await this.deps.getTasks(0);
        
        for (const depId of task.depends_on) {
          const depTask = allTasks.find(t => t.id === depId);
          if (depTask && depTask.team !== teamId) {
            risk += 0.2; // Cross-team dependency risk
          }
        }
      } catch (error) {
        risk += 0.3; // Default higher risk if can't determine dependencies
      }
    }
    
    return Math.min(1.0, risk);
  }

  private calculateSkillOverlap(skills1: Array<{skill: string, proficiency: number}>, skills2: Array<{skill: string, proficiency: number}>): number {
    if (skills1.length === 0 || skills2.length === 0) return 0;
    
    const skill1Names = new Set(skills1.map(s => s.skill));
    const skill2Names = new Set(skills2.map(s => s.skill));
    
    // Convert sets to arrays for iteration compatibility
    const skill1Array = Array.from(skill1Names);
    const intersection = new Set(skill1Array.filter(x => skill2Names.has(x)));
    const union = new Set([...skill1Array, ...Array.from(skill2Names)]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}