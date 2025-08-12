#!/usr/bin/env node
/**
 * Wave Status CLI - Check and report current wave status
 * Called by GitHub Actions to monitor wave transitions
 */

import { GitHubClient } from '../github/client';
import { DeploymentGate, DeploymentGateConfig } from '../core/deployment-gate';
import { WaveGateCheck, WaveGateCheckConfig } from '../core/wave-gate-check';

interface WaveStatusOptions {
  wave?: string;
  plan?: string;
  verbose?: boolean;
}

class WaveStatusChecker {
  private client: GitHubClient;
  private deploymentGate: DeploymentGate;
  private waveGateCheck: WaveGateCheck;

  constructor() {
    const auth = process.env.GITHUB_TOKEN;
    if (!auth) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable is required');
    }

    const [owner, repo] = repository.split('/');
    this.client = new GitHubClient({ auth }, owner, repo);
    
    this.deploymentGate = new DeploymentGate(this.client);
    this.waveGateCheck = new WaveGateCheck(this.client);
  }

  /**
   * Check status of all active waves
   */
  async checkWaveStatus(options: WaveStatusOptions): Promise<void> {
    console.log('🌊 Checking wave status...');

    try {
      // Get current coordination issues to determine active waves
      const activeWaves = await this.getActiveWaves();

      if (activeWaves.length === 0) {
        console.log('📋 No active waves found');
        return;
      }

      for (const wave of activeWaves) {
        await this.checkSingleWave(wave, options.verbose);
      }

      console.log('✅ Wave status check completed');
    } catch (error) {
      console.error('❌ Wave status check failed:', error);
      throw error;
    }
  }

  /**
   * Get list of active waves from coordination issues
   */
  private async getActiveWaves(): Promise<{ number: number; issueNumber: number; plan: string }[]> {
    console.log('Searching for coordination issues...');
    
    // Search for open coordination issues
    const issues = await this.client.searchIssues('is:open label:coordination');
    
    const waves = issues.items
      .filter(issue => issue.title.includes('Wave'))
      .map(issue => {
        const waveMatch = issue.title.match(/Wave (\d+)/i);
        const planMatch = issue.title.match(/·\s*([^·]+)\s*·/);
        
        return {
          number: waveMatch ? parseInt(waveMatch[1]) : 0,
          issueNumber: issue.number,
          plan: planMatch ? planMatch[1].trim() : 'default'
        };
      })
      .filter(wave => wave.number > 0);

    console.log(`Found ${waves.length} active waves: ${waves.map(w => `Wave ${w.number}`).join(', ')}`);
    return waves;
  }

  /**
   * Check status of a single wave
   */
  private async checkSingleWave(wave: { number: number; issueNumber: number; plan: string }, verbose = false): Promise<void> {
    console.log(`\n🔍 Checking Wave ${wave.number} (Issue #${wave.issueNumber})...`);

    try {
      // Mock wave configuration - in real implementation, this would be loaded from tasks.yaml
      const mockGateConfig: DeploymentGateConfig = {
        wave: wave.number,
        plan: wave.plan,
        teams: {
          alpha: { tasks: [] },
          beta: { tasks: [] }
        }
      };

      const mockCheckConfig: WaveGateCheckConfig = {
        wave: wave.number,
        plan: wave.plan,
        checkName: `Wave ${wave.number}`,
        coordinationIssueNumber: wave.issueNumber
      };

      // Check deployment gate status
      console.log('🚪 Checking deployment gates...');
      const gateStatus = await this.deploymentGate.checkWaveGateStatus(mockGateConfig);

      if (verbose) {
        console.log(`Teams ready: ${gateStatus.readyTeams.length}/${gateStatus.teamResults.length}`);
        console.log(`Ready teams: ${gateStatus.readyTeams.join(', ') || 'none'}`);
        console.log(`Blocked teams: ${gateStatus.blockedTeams.join(', ') || 'none'}`);
      }

      if (gateStatus.allTeamsReady) {
        console.log('✅ All teams ready - checking if wave gate should open...');
        
        // Trigger wave gate check if needed
        const shouldTrigger = WaveGateCheck.shouldTriggerGateCheck();
        if (shouldTrigger) {
          console.log('🎯 Triggering wave gate check...');
          const result = await this.waveGateCheck.checkWaveGate(mockCheckConfig, mockGateConfig);
          
          if (result.waveComplete) {
            console.log(`🎉 Wave ${wave.number} COMPLETE!`);
            if (result.announcement) {
              await this.waveGateCheck.updateCoordinationIssue(
                wave.issueNumber,
                gateStatus,
                result.announcement
              );
            }
          }
        } else {
          console.log('⏸️ Wave gate check not needed (no state change)');
        }
      } else {
        console.log(`⏳ Wave ${wave.number} in progress (${gateStatus.readyTeams.length}/${gateStatus.teamResults.length} teams ready)`);
        
        if (verbose && gateStatus.blockedTeams.length > 0) {
          console.log('❌ Blocked teams:');
          for (const team of gateStatus.blockedTeams) {
            const teamResult = gateStatus.teamResults.find(r => r.team === team);
            if (teamResult) {
              console.log(`  - ${team}: ${teamResult.validationSummary.errors.join(', ')}`);
            }
          }
        }
      }

    } catch (error) {
      console.error(`❌ Failed to check Wave ${wave.number}:`, error);
      // Continue checking other waves
    }
  }

  /**
   * Generate status report
   */
  async generateStatusReport(): Promise<string> {
    const activeWaves = await this.getActiveWaves();
    
    if (activeWaves.length === 0) {
      return '📋 No active waves\n\nAll waves are complete or no coordination is active.';
    }

    let report = '🌊 **Wave Status Report**\n\n';
    
    for (const wave of activeWaves) {
      try {
        const mockGateConfig: DeploymentGateConfig = {
          wave: wave.number,
          plan: wave.plan,
          teams: { alpha: { tasks: [] }, beta: { tasks: [] } }
        };

        const gateStatus = await this.deploymentGate.checkWaveGateStatus(mockGateConfig);
        const statusEmoji = gateStatus.allTeamsReady ? '✅' : '⏳';
        
        report += `${statusEmoji} **Wave ${wave.number}** (#${wave.issueNumber})\n`;
        report += `- Ready: ${gateStatus.readyTeams.length}/${gateStatus.teamResults.length} teams\n`;
        
        if (gateStatus.allTeamsReady) {
          report += '- Status: **READY FOR COMPLETION**\n';
        } else {
          report += `- Blocked: ${gateStatus.blockedTeams.join(', ')}\n`;
        }
        
        report += '\n';
      } catch {
        report += `❌ **Wave ${wave.number}**: Error checking status\n\n`;
      }
    }

    report += `*Updated: ${new Date().toISOString()}*`;
    return report;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): WaveStatusOptions {
  const args = process.argv.slice(2);
  const options: WaveStatusOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('--wave=')) {
      options.wave = arg.split('=')[1];
    } else if (arg.startsWith('--plan=')) {
      options.plan = arg.split('=')[1];
    }
  }

  return options;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const options = parseArgs();
    const checker = new WaveStatusChecker();
    await checker.checkWaveStatus(options);
  } catch (error) {
    console.error('Wave status check failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { WaveStatusChecker };