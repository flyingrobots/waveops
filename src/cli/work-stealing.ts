#!/usr/bin/env node
/**
 * Work Stealing CLI Commands - Interface for manual work claiming and releasing
 */

import { WaveCoordinator } from '../core/coordinator';
import { GitHubClient } from '../github/client';
import { ValidationEngine } from '../core/validation-engine';
import { WorkStealingError } from '../types/index';

interface CLIOptions {
  taskId?: string;
  team?: string;
  wave?: number;
  verbose?: boolean;
}

class WorkStealingCLI {
  private coordinator: WaveCoordinator;

  constructor() {
    // Initialize with mock dependencies for CLI demonstration
    const githubClient = new GitHubClient('owner', 'repo', { auth: 'token' });
    const validationEngine = new ValidationEngine(githubClient);
    
    const deps = {
      githubClient,
      validationEngine,
      getWaveState: async () => ({
        plan: 'demo-plan',
        wave: 1,
        tz: 'UTC',
        teams: {
          'frontend': { status: 'in_progress' as const, tasks: ['ui-task-1', 'ui-task-2'] },
          'backend': { status: 'blocked' as const, tasks: ['api-task-1'], reason: 'Waiting for specs' },
          'devops': { status: 'ready' as const, tasks: [] }
        },
        all_ready: false,
        updated_at: new Date().toISOString()
      }),
      updateWaveState: async () => {},
      getTasks: async () => [
        { id: 'ui-task-1', title: 'Frontend Dashboard', wave: 1, team: 'frontend', depends_on: [], acceptance: [], critical: false },
        { id: 'ui-task-2', title: 'UI Components', wave: 1, team: 'frontend', depends_on: [], acceptance: [], critical: false },
        { id: 'api-task-1', title: 'Backend API', wave: 1, team: 'backend', depends_on: ['ui-task-1'], acceptance: [], critical: true }
      ],
      updateTaskAssignment: async (taskId: string, newTeam: string) => {
        console.log(`📝 Updated task ${taskId} assignment to team ${newTeam}`);
      },
      getTeamCapacity: async (teamId: string) => {
        const capacities: Record<string, number> = {
          'frontend': 3,
          'backend': 4,
          'devops': 5
        };
        return capacities[teamId] || 2;
      },
      getTeamSkills: async (teamId: string) => {
        const skills: Record<string, Array<{skill: string, proficiency: number}>> = {
          'frontend': [{ skill: 'frontend', proficiency: 0.9 }, { skill: 'mobile', proficiency: 0.6 }],
          'backend': [{ skill: 'backend', proficiency: 0.8 }, { skill: 'devops', proficiency: 0.5 }],
          'devops': [{ skill: 'devops', proficiency: 0.9 }, { skill: 'backend', proficiency: 0.4 }]
        };
        return skills[teamId] || [];
      },
      notifyTeamOfChange: async (teamId: string, message: string) => {
        console.log(`📢 Notification to ${teamId}: ${message}`);
      }
    };

    this.coordinator = new WaveCoordinator(deps);
  }

  /**
   * Claim a task for a team
   */
  async claimTask(options: CLIOptions): Promise<void> {
    if (!options.taskId || !options.team) {
      console.error('❌ Error: --task-id and --team are required for claiming');
      process.exit(1);
    }

    try {
      console.log(`🎯 Attempting to claim task ${options.taskId} for team ${options.team}...`);
      
      const success = await this.coordinator.claimTask(options.taskId, options.team);
      
      if (success) {
        console.log(`✅ Successfully claimed task ${options.taskId} for team ${options.team}`);
        
        if (options.verbose) {
          const status = await this.coordinator.coordinateWave();
          this.displayCoordinationStatus(status);
        }
      } else {
        console.log(`❌ Failed to claim task ${options.taskId} for team ${options.team}`);
      }
    } catch (error) {
      if (error instanceof WorkStealingError) {
        console.error(`❌ Work Stealing Error: ${error.message}`);
        if (error.context && options.verbose) {
          console.error('Context:', JSON.stringify(error.context, null, 2));
        }
      } else {
        console.error(`❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    }
  }

  /**
   * Release a task from a team
   */
  async releaseTask(options: CLIOptions): Promise<void> {
    if (!options.taskId || !options.team) {
      console.error('❌ Error: --task-id and --team are required for releasing');
      process.exit(1);
    }

    try {
      console.log(`🔄 Attempting to release task ${options.taskId} from team ${options.team}...`);
      
      const newTeam = await this.coordinator.releaseTask(options.taskId, options.team);
      
      console.log(`✅ Successfully released task ${options.taskId} from team ${options.team}`);
      console.log(`📍 Task reassigned to team: ${newTeam}`);
      
      if (options.verbose) {
        const status = await this.coordinator.coordinateWave();
        this.displayCoordinationStatus(status);
      }
    } catch (error) {
      if (error instanceof WorkStealingError) {
        console.error(`❌ Work Stealing Error: ${error.message}`);
        if (error.context && options.verbose) {
          console.error('Context:', JSON.stringify(error.context, null, 2));
        }
      } else {
        console.error(`❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exit(1);
    }
  }

  /**
   * Show current work stealing status and recommendations
   */
  async showStatus(options: CLIOptions): Promise<void> {
    try {
      console.log('🔍 Work Stealing System Status\n');
      
      const coordinationResult = await this.coordinator.coordinateWave();
      this.displayCoordinationStatus(coordinationResult);
      
    } catch (error) {
      console.error(`❌ Failed to get status: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  /**
   * Execute automatic work rebalancing
   */
  async rebalance(options: CLIOptions): Promise<void> {
    try {
      console.log('⚖️  Executing automatic work rebalancing...\n');
      
      const result = await this.coordinator.coordinateWave();
      
      if (result.workStealingActive) {
        console.log('🎯 Work stealing was active during coordination');
        console.log(`📊 Transfers executed: ${result.transfersExecuted}`);
        console.log(`📈 Utilization improvement: ${(result.utilizationImprovement * 100).toFixed(1)}%`);
      } else {
        console.log('😴 No work rebalancing needed - teams are well balanced');
      }

      this.displayCoordinationStatus(result);
      
    } catch (error) {
      console.error(`❌ Rebalancing failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  /**
   * Display coordination status in a formatted way
   */
  private displayCoordinationStatus(result: any): void {
    console.log('\n📋 Coordination Status:');
    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   Wave Ready: ${result.waveReady ? '✅' : '⏳'}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error: string) => console.log(`   • ${error}`));
    }
    
    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      result.recommendations.forEach((rec: string) => console.log(`   • ${rec}`));
    }

    if (result.transfersExecuted > 0) {
      console.log('\n🔄 Work Transfers:');
      console.log(`   Successful: ${result.transfersExecuted}`);
      console.log(`   Improvement: ${(result.utilizationImprovement * 100).toFixed(1)}%`);
    }
  }

  /**
   * Parse command line arguments and execute appropriate action
   */
  async run(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const options: CLIOptions = {};
    
    // Parse options
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];
      
      switch (arg) {
        case '--task-id':
          options.taskId = nextArg;
          i++;
          break;
        case '--team':
          options.team = nextArg;
          i++;
          break;
        case '--wave':
          options.wave = parseInt(nextArg, 10);
          i++;
          break;
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
      }
    }

    switch (command) {
      case 'claim':
        await this.claimTask(options);
        break;
      case 'release':
        await this.releaseTask(options);
        break;
      case 'status':
        await this.showStatus(options);
        break;
      case 'rebalance':
        await this.rebalance(options);
        break;
      default:
        this.showHelp();
        process.exit(1);
    }
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    console.log(`
🌊 WaveOps Work Stealing CLI

USAGE:
  waveops-steal <command> [options]

COMMANDS:
  claim      Claim a task for your team
  release    Release a task from your team  
  status     Show work stealing system status
  rebalance  Execute automatic work rebalancing

OPTIONS:
  --task-id <id>    Task ID to claim/release
  --team <name>     Team name  
  --wave <number>   Wave number (default: current)
  --verbose, -v     Show detailed output

EXAMPLES:
  waveops-steal claim --task-id ui-task-1 --team frontend
  waveops-steal release --task-id api-task-1 --team backend
  waveops-steal status --verbose
  waveops-steal rebalance

For more information, visit: https://github.com/waveops/waveops
`);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new WorkStealingCLI();
  cli.run().catch(error => {
    console.error('❌ CLI Error:', error);
    process.exit(1);
  });
}

export { WorkStealingCLI };