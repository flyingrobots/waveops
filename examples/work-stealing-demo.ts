#!/usr/bin/env ts-node
/**
 * Work Stealing System Demo
 * Demonstrates the intelligent load balancing capabilities of WaveOps
 */

import { WaveCoordinator } from '../src/core/coordinator';
import { GitHubClient } from '../src/github/client';
import { ValidationEngine } from '../src/core/validation-engine';
import { WorkStealingConfig } from '../src/types/index';

async function runWorkStealingDemo() {
  console.log('🌊 WaveOps Work Stealing System Demo\n');

  // Setup mock dependencies for demonstration
  const githubClient = new GitHubClient('waveops', 'demo-repo', { auth: 'demo-token' });
  const validationEngine = new ValidationEngine(githubClient);

  const dependencies = {
    githubClient,
    validationEngine,
    getWaveState: async () => ({
      plan: 'work-stealing-demo',
      wave: 1,
      tz: 'UTC',
      teams: {
        'frontend': {
          status: 'in_progress' as const,
          tasks: ['ui-dashboard', 'ui-components', 'ui-styling', 'ui-responsive', 'ui-animations']
        },
        'backend': {
          status: 'blocked' as const,
          tasks: ['api-auth'],
          reason: 'Waiting for security review'
        },
        'mobile': {
          status: 'in_progress' as const,
          tasks: ['mobile-login', 'mobile-nav']
        },
        'devops': {
          status: 'ready' as const,
          tasks: []
        }
      },
      all_ready: false,
      updated_at: new Date().toISOString()
    }),
    updateWaveState: async () => console.log('📝 Wave state updated'),
    getTasks: async () => [
      { id: 'ui-dashboard', title: 'Frontend Dashboard', wave: 1, team: 'frontend', depends_on: [], acceptance: [], critical: true },
      { id: 'ui-components', title: 'UI Component Library', wave: 1, team: 'frontend', depends_on: [], acceptance: [], critical: false },
      { id: 'ui-styling', title: 'CSS Styling System', wave: 1, team: 'frontend', depends_on: [], acceptance: [], critical: false },
      { id: 'ui-responsive', title: 'Responsive Design', wave: 1, team: 'frontend', depends_on: ['ui-components'], acceptance: [], critical: false },
      { id: 'ui-animations', title: 'UI Animations', wave: 1, team: 'frontend', depends_on: [], acceptance: [], critical: false },
      { id: 'api-auth', title: 'Authentication API', wave: 1, team: 'backend', depends_on: [], acceptance: [], critical: true },
      { id: 'mobile-login', title: 'Mobile Login Flow', wave: 1, team: 'mobile', depends_on: ['api-auth'], acceptance: [], critical: true },
      { id: 'mobile-nav', title: 'Mobile Navigation', wave: 1, team: 'mobile', depends_on: ['ui-components'], acceptance: [], critical: false }
    ],
    updateTaskAssignment: async (taskId: string, newTeam: string) => {
      console.log(`🔄 Task ${taskId} reassigned to ${newTeam}`);
    },
    getTeamCapacity: async (teamId: string) => {
      const capacities: Record<string, number> = {
        'frontend': 3,    // Overloaded: 5 tasks / 3 capacity = 167%
        'backend': 2,     // Underloaded: 1 task / 2 capacity = 50% (but blocked)
        'mobile': 3,      // Normal: 2 tasks / 3 capacity = 67%
        'devops': 4       // Completely free: 0 tasks / 4 capacity = 0%
      };
      return capacities[teamId] || 2;
    },
    getTeamSkills: async (teamId: string) => {
      const skills: Record<string, Array<{skill: string, proficiency: number}>> = {
        'frontend': [
          { skill: 'frontend', proficiency: 0.95 },
          { skill: 'mobile', proficiency: 0.4 }
        ],
        'backend': [
          { skill: 'backend', proficiency: 0.9 },
          { skill: 'devops', proficiency: 0.3 }
        ],
        'mobile': [
          { skill: 'mobile', proficiency: 0.85 },
          { skill: 'frontend', proficiency: 0.6 }
        ],
        'devops': [
          { skill: 'devops', proficiency: 0.9 },
          { skill: 'backend', proficiency: 0.5 },
          { skill: 'frontend', proficiency: 0.3 }
        ]
      };
      return skills[teamId] || [];
    },
    notifyTeamOfChange: async (teamId: string, message: string) => {
      console.log(`📢 ${teamId}: ${message}`);
    }
  };

  // Configure work stealing for demonstration
  const config: WorkStealingConfig = {
    enabled: true,
    utilizationThreshold: 0.8,      // Teams above 80% utilization are bottlenecks
    imbalanceThreshold: 0.4,        // High variance triggers rebalancing
    minimumTransferBenefit: 0.1,    // Low threshold for demo purposes
    maxTransfersPerWave: 3,         // Allow up to 3 transfers per wave
    skillMatchThreshold: 0.3,       // Relaxed skill matching for demo
    coordinationOverheadWeight: 0.1,
    proactiveStealingEnabled: true,
    emergencyStealingEnabled: true
  };

  const coordinator = new WaveCoordinator(dependencies, config);

  console.log('📊 Initial Team State:');
  console.log('  Frontend: 5 tasks / 3 capacity = 167% utilization (OVERLOADED)');
  console.log('  Backend:  1 task  / 2 capacity = 50% utilization (BLOCKED)');
  console.log('  Mobile:   2 tasks / 3 capacity = 67% utilization (NORMAL)');
  console.log('  DevOps:   0 tasks / 4 capacity = 0% utilization (UNDERUTILIZED)\n');

  console.log('🎯 Executing Wave Coordination with Work Stealing...\n');

  try {
    const result = await coordinator.coordinateWave();

    console.log('\n📋 Coordination Results:');
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    console.log(`  Wave Ready: ${result.waveReady ? '✅' : '⏳ Waiting for teams'}`);
    console.log(`  Work Stealing Active: ${result.workStealingActive ? '⚡ Yes' : '😴 No rebalancing needed'}`);
    console.log(`  Transfers Executed: ${result.transfersExecuted}`);
    console.log(`  Utilization Improvement: ${(result.utilizationImprovement * 100).toFixed(1)}%`);

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`  • ${error}`));
    }

    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      result.recommendations.forEach(rec => console.log(`  • ${rec}`));
    }

    console.log('\n🎭 Manual Task Management Demo...\n');

    // Demo manual task claiming
    try {
      console.log('🎯 DevOps team claims a UI task...');
      const claimSuccess = await coordinator.claimTask('ui-animations', 'devops');
      console.log(`  Claim result: ${claimSuccess ? '✅ Success' : '❌ Failed'}`);
    } catch (error) {
      console.log(`  Claim result: ❌ ${error instanceof Error ? error.message : String(error)}`);
    }

    // Demo task release
    try {
      console.log('\n🔄 Frontend team releases overloaded work...');
      const newTeam = await coordinator.releaseTask('ui-styling', 'frontend');
      console.log(`  Task reassigned to: ${newTeam}`);
    } catch (error) {
      console.log(`  Release failed: ❌ ${error instanceof Error ? error.message : String(error)}`);
    }

  } catch (error) {
    console.error('\n❌ Demo failed:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n🌊 Work Stealing Demo Complete!');
  console.log('\nKey Benefits Demonstrated:');
  console.log('  ⚡ Automatic load balancing across teams');
  console.log('  🎯 Skill-based task matching');
  console.log('  🛡️ Coordination safety with rollback');
  console.log('  📊 Real-time utilization monitoring');
  console.log('  🎭 Manual task claiming and releasing');
  console.log('\nLearn more: npm run steal --help');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runWorkStealingDemo().catch(error => {
    console.error('❌ Demo Error:', error);
    process.exit(1);
  });
}

export { runWorkStealingDemo };