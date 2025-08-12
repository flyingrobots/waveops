/**
 * Wave Gate Check System (W2.T004) - GitHub Check Run for wave completion
 * Implemented by Bob for Team Beta
 */

import { GitHubClient } from '../github/client';
import { DeploymentGate, DeploymentGateConfig, WaveGateStatus } from './deployment-gate';
import { WaveState, TeamState } from '../types';
import { GitHubCheckRun } from '../types';

export interface WaveGateCheckConfig {
  wave: number;
  plan: string;
  checkName: string;
  coordinationIssueNumber: number;
}

export interface WaveGateResult {
  checkRun: GitHubCheckRun;
  waveComplete: boolean;
  previousState?: WaveState;
  newState: WaveState;
  announcement?: string;
}

export class WaveGateCheck {
  private client: GitHubClient;
  private deploymentGate: DeploymentGate;
  
  // Race condition prevention
  private static activeChecks = new Map<string, Promise<WaveGateResult>>();

  constructor(client: GitHubClient) {
    this.client = client;
    this.deploymentGate = new DeploymentGate(client);
  }

  /**
   * Check wave gate status and create GitHub Check Run
   */
  async checkWaveGate(
    config: WaveGateCheckConfig,
    gateConfig: DeploymentGateConfig,
    currentState?: WaveState
  ): Promise<WaveGateResult> {
    const checkKey = `${config.plan}-wave-${config.wave}`;
    
    // Prevent race conditions - only one check per wave at a time
    if (WaveGateCheck.activeChecks.has(checkKey)) {
      return await WaveGateCheck.activeChecks.get(checkKey)!;
    }

    const checkPromise = this._performWaveGateCheck(config, gateConfig, currentState);
    WaveGateCheck.activeChecks.set(checkKey, checkPromise);

    try {
      const result = await checkPromise;
      return result;
    } finally {
      WaveGateCheck.activeChecks.delete(checkKey);
    }
  }

  /**
   * Internal wave gate check implementation
   */
  private async _performWaveGateCheck(
    config: WaveGateCheckConfig,
    gateConfig: DeploymentGateConfig,
    currentState?: WaveState
  ): Promise<WaveGateResult> {
    // Get current wave gate status from deployments
    const gateStatus = await this.deploymentGate.checkWaveGateStatus(gateConfig);
    
    // Determine if wave is complete
    const waveComplete = gateStatus.allTeamsReady;
    
    // Create new wave state
    const newState = this.createUpdatedWaveState(gateConfig, gateStatus, currentState);
    
    // Create check run based on gate status
    const checkRun = await this.createWaveGateCheckRun(config, gateStatus, waveComplete);
    
    // Generate announcement if wave just completed
    let announcement: string | undefined;
    if (waveComplete && (!currentState || !currentState.all_ready)) {
      announcement = this.generateWaveCompletionAnnouncement(gateStatus, newState);
    }

    return {
      checkRun,
      waveComplete,
      previousState: currentState,
      newState,
      announcement
    };
  }

  /**
   * Create GitHub Check Run for wave gate status
   */
  private async createWaveGateCheckRun(
    config: WaveGateCheckConfig,
    gateStatus: WaveGateStatus,
    waveComplete: boolean
  ): Promise<GitHubCheckRun> {
    const checkName = `Wave Gate: ${config.checkName}`;
    const headSha = 'main'; // In real implementation, would get actual SHA
    
    if (waveComplete) {
      // Wave complete - success check run
      return await this.client.createCheckRun({
        name: checkName,
        head_sha: headSha,
        status: 'completed',
        conclusion: 'success',
        output: {
          title: `🎉 Wave ${config.wave} Complete!`,
          summary: this.formatSuccessCheckRunSummary(gateStatus)
        }
      });
    } else {
      // Wave in progress - pending check run
      return await this.client.createCheckRun({
        name: checkName,
        head_sha: headSha,
        status: 'in_progress',
        output: {
          title: `🔄 Wave ${config.wave} In Progress`,
          summary: this.formatPendingCheckRunSummary(gateStatus)
        }
      });
    }
  }

  /**
   * Create updated wave state based on gate status
   */
  private createUpdatedWaveState(
    gateConfig: DeploymentGateConfig,
    gateStatus: WaveGateStatus,
    currentState?: WaveState
  ): WaveState {
    const teamStates: Record<string, TeamState> = {};
    
    // Update team states based on gate results
    for (const teamResult of gateStatus.teamResults) {
      teamStates[teamResult.team] = {
        status: teamResult.ready ? 'ready' as const : 'in_progress' as const,
        at: teamResult.lastChecked,
        reason: teamResult.ready ? undefined : 'Tasks incomplete',
        tasks: gateConfig.teams[teamResult.team]?.tasks.map(t => t.taskId) || []
      };
    }

    return {
      plan: gateConfig.plan,
      wave: gateConfig.wave,
      tz: currentState?.tz || 'UTC',
      teams: teamStates,
      all_ready: gateStatus.allTeamsReady,
      updated_at: gateStatus.lastUpdated
    };
  }

  /**
   * Generate wave completion announcement
   */
  private generateWaveCompletionAnnouncement(
    gateStatus: WaveGateStatus,
    newState: WaveState
  ): string {
    const readyTeamsList = gateStatus.readyTeams
      .map(team => `**Team ${team.charAt(0).toUpperCase() + team.slice(1)}**`)
      .join(', ');

    return `🎉 **WAVE ${gateStatus.wave} COMPLETE!**\n\n` +
           `**Wave Gate Status:** ✅ SUCCESS\n\n` +
           `All teams have successfully completed their Wave ${gateStatus.wave} tasks:\n` +
           `${readyTeamsList}\n\n` +
           `**Next Steps:** Wave ${gateStatus.wave + 1} tasks are now available for assignment!\n\n` +
           `Great work everyone! 🚀\n\n` +
           `---\n` +
           `*Updated: ${new Date(newState.updated_at).toLocaleString()}*`;
  }

  /**
   * Format success check run summary
   */
  private formatSuccessCheckRunSummary(gateStatus: WaveGateStatus): string {
    const teamDetails = gateStatus.teamResults
      .map(result => `- ✅ **${result.team}**: All tasks complete`)
      .join('\n');

    return `All teams have completed their Wave ${gateStatus.wave} tasks successfully!\n\n` +
           `## Team Status\n${teamDetails}\n\n` +
           `## Gate Decision\n` +
           `✅ **WAVE GATE OPEN** - All teams ready\n\n` +
           `Wave ${gateStatus.wave + 1} tasks are now available for assignment.`;
  }

  /**
   * Format pending check run summary
   */
  private formatPendingCheckRunSummary(gateStatus: WaveGateStatus): string {
    const readyTeams = gateStatus.readyTeams
      .map(team => `- ✅ **${team}**: Ready`)
      .join('\n');
    
    const blockedTeams = gateStatus.blockedTeams
      .map(team => {
        const result = gateStatus.teamResults.find(r => r.team === team);
        const taskList = result?.validationSummary.invalidTasks.join(', ') || 'Unknown';
        return `- ❌ **${team}**: Blocked (${taskList})`;
      })
      .join('\n');

    return `Wave ${gateStatus.wave} coordination in progress...\n\n` +
           `## Ready Teams\n${readyTeams || 'None yet'}\n\n` +
           `## Blocked Teams\n${blockedTeams || 'None'}\n\n` +
           `## Gate Decision\n` +
           `🔄 **WAITING** - Need all teams ready to open wave gate\n\n` +
           `Teams should complete their tasks and run \`/ready wave-${gateStatus.wave}\` when done.`;
  }

  /**
   * Update coordination issue with wave gate status
   */
  async updateCoordinationIssue(
    issueNumber: number,
    gateStatus: WaveGateStatus,
    announcement?: string
  ): Promise<void> {
    const statusComment = this.deploymentGate.formatWaveGateStatus(gateStatus);
    
    let commentBody = statusComment;
    if (announcement) {
      commentBody = `${announcement}\n\n---\n\n${statusComment}`;
    }

    await this.client.addIssueComment(issueNumber, commentBody);
  }

  /**
   * Check if wave gate should trigger based on state changes
   */
  static shouldTriggerGateCheck(
    previousState?: WaveState,
    newReadinessData?: { team: string; ready: boolean }
  ): boolean {
    // Trigger if:
    // 1. No previous state (initial check)
    // 2. A team just became ready
    // 3. Previous state wasn't all ready (prevent duplicate announcements)
    
    if (!previousState) {
      return true;
    }
    
    if (newReadinessData?.ready && previousState.teams[newReadinessData.team]?.status !== 'ready') {
      return true;
    }
    
    return false;
  }

  /**
   * Cleanup method for testing
   */
  static clearActiveChecks(): void {
    WaveGateCheck.activeChecks.clear();
  }
}