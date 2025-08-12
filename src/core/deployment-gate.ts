/**
 * Deployment Gate System (W2.T003) - GitHub Deployments for team readiness tracking
 * Implemented by Bob for Team Beta
 */

import { GitHubClient } from '../github/client';
import { ValidationEngine } from './validation-engine';
import { GitHubDeployment } from '../types';

export interface DeploymentGateConfig {
  wave: number;
  plan: string;
  teams: Record<string, {
    tasks: Array<{ taskId: string; issueNumber: number }>;
  }>;
}

export interface TeamReadinessResult {
  team: string;
  ready: boolean;
  deployment?: GitHubDeployment;
  validationSummary: {
    allValid: boolean;
    validTasks: string[];
    invalidTasks: string[];
    errors: string[];
  };
  lastChecked: string;
}

export interface WaveGateStatus {
  wave: number;
  allTeamsReady: boolean;
  teamResults: TeamReadinessResult[];
  readyTeams: string[];
  blockedTeams: string[];
  lastUpdated: string;
}

export class DeploymentGate {
  private client: GitHubClient;
  public validator: ValidationEngine; // Made public for testing

  constructor(client: GitHubClient) {
    this.client = client;
    this.validator = new ValidationEngine(client);
  }

  /**
   * Create deployment environment for team readiness tracking
   */
  async createTeamReadinessDeployment(
    team: string,
    wave: number,
    status: 'pending' | 'success' | 'failure' | 'error',
    description: string
  ): Promise<GitHubDeployment> {
    const environment = `wave-${wave}-ready`;
    
    const deployment = await this.client.createDeployment({
      environment,
      ref: 'main', // In real implementation, this would be the current commit
      description: `${team} team readiness for Wave ${wave}: ${description}`,
      payload: {
        team,
        wave,
        status,
        timestamp: new Date().toISOString()
      }
    });

    // Update deployment status
    await this.client.updateDeploymentStatus(
      deployment.id,
      status,
      description
    );

    return deployment;
  }

  /**
   * Validate team readiness and update deployment status
   */
  async validateAndUpdateTeamReadiness(
    team: string,
    wave: number,
    teamTasks: Array<{ taskId: string; issueNumber: number }>
  ): Promise<TeamReadinessResult> {
    const timestamp = new Date().toISOString();
    
    try {
      // Run validation on all team tasks
      const validationSummary = await this.validator.getTeamValidationSummary(teamTasks);
      
      let deployment: GitHubDeployment;
      if (validationSummary.allValid) {
        // All tasks complete - create success deployment
        deployment = await this.createTeamReadinessDeployment(
          team,
          wave,
          'success',
          `All tasks complete: ${validationSummary.validTasks.join(', ')}`
        );
      } else {
        // Tasks incomplete - create failure deployment
        const blockedTasks = validationSummary.invalidTasks.join(', ');
        deployment = await this.createTeamReadinessDeployment(
          team,
          wave,
          'failure',
          `Blocked tasks: ${blockedTasks}`
        );
      }

      return {
        team,
        ready: validationSummary.allValid,
        deployment,
        validationSummary,
        lastChecked: timestamp
      };

    } catch (error) {
      // Validation failed - create error deployment
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      const deployment = await this.createTeamReadinessDeployment(
        team,
        wave,
        'error',
        `Validation error: ${errorMessage}`
      );

      return {
        team,
        ready: false,
        deployment,
        validationSummary: {
          allValid: false,
          validTasks: [],
          invalidTasks: teamTasks.map(t => t.taskId),
          errors: [errorMessage]
        },
        lastChecked: timestamp
      };
    }
  }

  /**
   * Check wave gate status across all teams
   */
  async checkWaveGateStatus(config: DeploymentGateConfig): Promise<WaveGateStatus> {
    const teamResults: TeamReadinessResult[] = [];
    
    // Validate each team in parallel
    const validationPromises = Object.entries(config.teams).map(
      ([team, teamConfig]) => 
        this.validateAndUpdateTeamReadiness(team, config.wave, teamConfig.tasks)
    );

    const results = await Promise.all(validationPromises);
    teamResults.push(...results);

    const readyTeams = teamResults.filter(r => r.ready).map(r => r.team);
    const blockedTeams = teamResults.filter(r => !r.ready).map(r => r.team);
    const allTeamsReady = readyTeams.length === teamResults.length;

    return {
      wave: config.wave,
      allTeamsReady,
      teamResults,
      readyTeams,
      blockedTeams,
      lastUpdated: new Date().toISOString()
    };
  }

  // Note: getTeamReadinessFromDeployments method would be implemented here
  // in a full system to query GitHub Deployments API for latest status

  /**
   * Format deployment status for human consumption
   */
  formatTeamReadinessStatus(result: TeamReadinessResult): string {
    const { team, ready, validationSummary, lastChecked } = result;
    const timeStr = new Date(lastChecked).toLocaleTimeString();
    
    if (ready) {
      return `✅ **Team ${team.charAt(0).toUpperCase() + team.slice(1)} Ready!**\n\n` +
             `**Tasks Completed:** ${validationSummary.validTasks.join(', ')}\n` +
             `**Deployment:** wave-ready → SUCCESS\n` +
             `**Validated:** ${timeStr}\n\n` +
             `All tasks validated successfully! 🎉`;
    } else {
      const errorSummary = validationSummary.errors.slice(0, 3).join('\n- ');
      return `❌ **Team ${team.charAt(0).toUpperCase() + team.slice(1)} Blocked**\n\n` +
             `**Incomplete Tasks:** ${validationSummary.invalidTasks.join(', ')}\n` +
             `**Issues:**\n- ${errorSummary}\n` +
             `**Deployment:** wave-ready → FAILURE\n` +
             `**Checked:** ${timeStr}\n\n` +
             `Please resolve issues before marking ready.`;
    }
  }

  /**
   * Format wave gate status summary
   */
  formatWaveGateStatus(status: WaveGateStatus): string {
    const { wave, allTeamsReady, readyTeams, blockedTeams, lastUpdated } = status;
    
    if (allTeamsReady) {
      return `🎉 **WAVE ${wave} COMPLETE!**\n\n` +
             `All teams ready: ${readyTeams.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}\n` +
             `**Updated:** ${new Date(lastUpdated).toLocaleTimeString()}\n\n` +
             `Wave gate is open! Ready to proceed to next wave.`;
    } else {
      const readyList = readyTeams.length > 0 ? readyTeams.map(t => `✅ ${t.charAt(0).toUpperCase() + t.slice(1)}`).join('\n') : 'None';
      const blockedList = blockedTeams.length > 0 ? blockedTeams.map(t => `❌ ${t.charAt(0).toUpperCase() + t.slice(1)}`).join('\n') : 'None';
      
      return `🔄 **Wave ${wave} In Progress**\n\n` +
             `**Ready Teams:**\n${readyList}\n\n` +
             `**Blocked Teams:**\n${blockedList}\n\n` +
             `**Updated:** ${new Date(lastUpdated).toLocaleTimeString()}\n\n` +
             `Waiting for all teams to complete their tasks.`;
    }
  }
}