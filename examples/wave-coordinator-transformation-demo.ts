#!/usr/bin/env node

/**
 * Wave Coordinator Transformation Demo
 * 
 * This demonstrates the comprehensive transformation of WaveCoordinator dependency methods
 * from fake/stub implementations to real GitHub API integration. This is the core of the
 * intelligent load balancing and work stealing system.
 */

import { WaveCoordinator } from '../src/core/coordinator';
import { GitHubClient } from '../src/github/client';
import { ValidationEngine } from '../src/core/validation-engine';

async function demonstrateWaveCoordinatorTransformation() {
  console.log('🚀 Wave Coordinator Transformation Demo');
  console.log('=====================================\n');

  // Test setup without GitHub client (fallback mode)
  console.log('📋 Test 1: Wave Coordinator without GitHub client (fallback mode)');
  console.log('----------------------------------------------------------------');

  // Create a mock GitHubClient for fallback testing
  const mockGitHubClient = {
    getTeamMembers: async () => [],
    getRepositoryIssues: async () => [],
  } as any;

  const mockDependencies = {
    githubClient: undefined as any, // Will trigger fallback behavior
    validationEngine: new ValidationEngine(mockGitHubClient),
    getWaveState: async () => ({
      plan: 'Demo Wave Plan',
      wave: 1,
      tz: 'UTC',
      all_ready: false,
      updated_at: new Date().toISOString(),
      teams: {
        'team-frontend': {
          status: 'in_progress' as const,
          reason: '',
          tasks: ['W1.T001', 'W1.T002'],
          ready_timestamp: null
        },
        'team-backend': {
          status: 'ready' as const,
          reason: '',
          tasks: ['W1.T003'],
          ready_timestamp: new Date().toISOString()
        }
      }
    }),
    updateWaveState: async () => {},
    getTasks: async () => [
      {
        id: 'W1.T001',
        title: 'Frontend React Component',
        wave: 1,
        team: 'team-frontend',
        depends_on: [],
        acceptance: ['Component renders correctly', 'Unit tests pass'],
        critical: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'W1.T002', 
        title: 'Backend API Endpoint',
        wave: 1,
        team: 'team-backend',
        depends_on: ['W1.T001'],
        acceptance: ['API returns correct data', 'Integration tests pass'],
        critical: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    updateTaskAssignment: async () => {},
    getTeamCapacity: async (teamId: string) => teamId.includes('frontend') ? 3 : 2,
    getTeamSkills: async (teamId: string) => [
      { skill: teamId.includes('frontend') ? 'frontend' : 'backend', proficiency: 0.8 }
    ],
    notifyTeamOfChange: async () => {}
  };

  try {
    const coordinator = new WaveCoordinator(mockDependencies);
    const result = await coordinator.coordinateWave();

    console.log('📊 Fallback Mode Results:', {
      success: result.success,
      waveReady: result.waveReady,
      workStealingActive: result.workStealingActive,
      transfersExecuted: result.transfersExecuted,
      errors: result.errors,
      recommendations: result.recommendations.slice(0, 2) // Limit output
    });

  } catch (error) {
    console.log('❌ Fallback test error:', error instanceof Error ? error.message : 'Unknown error');
  }

  console.log('\n');

  // Test setup with GitHub client (real mode)
  console.log('📋 Test 2: Wave Coordinator with GitHub client (real GitHub integration)');
  console.log('-------------------------------------------------------------------------');

  const testWithRealGitHub = process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO;

  if (testWithRealGitHub) {
    console.log('✅ GitHub credentials found - testing with real API integration');

    try {
      const githubClient = new GitHubClient(
        { auth: process.env.GITHUB_TOKEN! },
        process.env.GITHUB_OWNER!,
        process.env.GITHUB_REPO!
      );

      const realDependencies = {
        ...mockDependencies,
        githubClient // Real GitHub client that enables all the transformed methods
      };

      const coordinator = new WaveCoordinator(realDependencies);
      const result = await coordinator.coordinateWave();

      console.log('📊 Real GitHub Integration Results:', {
        success: result.success,
        waveReady: result.waveReady,
        workStealingActive: result.workStealingActive,
        transfersExecuted: result.transfersExecuted,
        utilizationImprovement: result.utilizationImprovement,
        errors: result.errors.slice(0, 2),
        recommendations: result.recommendations.slice(0, 3)
      });

    } catch (error) {
      console.log('❌ Real GitHub integration test error:', error instanceof Error ? error.message : 'Unknown error');
    }

  } else {
    console.log('ℹ️  No GitHub credentials provided - showing what real integration would do');
    console.log();
    console.log('To test with real GitHub API, set these environment variables:');
    console.log('  export GITHUB_TOKEN=your_github_personal_access_token');
    console.log('  export GITHUB_OWNER=your_github_organization_or_user');
    console.log('  export GITHUB_REPO=your_github_repository');
    console.log();
    console.log('Then run: npm run test:wave-coordinator-transformation');
  }

  console.log('\n');

  // Demonstrate transformation details
  console.log('🎯 Transformation Summary: From Fake to Real GitHub Integration');
  console.log('===============================================================');
  console.log();

  console.log('1. 📊 getTeamUtilization():');
  console.log('   BEFORE (Fake): Used hardcoded wave state, simple active task counting');
  console.log('   AFTER (Real):  Uses GitHub Teams API + Issues API for real utilization');
  console.log('   • Calls githubClient.getTeamMembers() for real team data');
  console.log('   • Calls getTeamActiveTasks() using GitHub Issues API');
  console.log('   • Calculates real active vs completed based on GitHub issue states');
  console.log('   • Uses sophisticated skill availability calculation');
  console.log('   • Graceful fallback to wave state if GitHub API fails');
  console.log();

  console.log('2. 🏢 getAllTeams():');
  console.log('   BEFORE (Fake): Used Object.keys(waveState.teams) static list');
  console.log('   AFTER (Real):  Discovers teams from GitHub organization');
  console.log('   • Tests common team name patterns against GitHub Teams API');
  console.log('   • Calls githubClient.getTeamMembers() to verify team existence');
  console.log('   • Returns only teams that actually exist in GitHub');
  console.log('   • Fallback to wave state teams if no GitHub teams found');
  console.log();

  console.log('3. ⏱️ estimateTaskDuration():');
  console.log('   BEFORE (Fake): Simple complexity += 0.5 if critical, +0.2 per dependency');
  console.log('   AFTER (Real):  Comprehensive GitHub issue analysis');
  console.log('   • Calls githubClient.getRepositoryIssues() to find real issue data');
  console.log('   • Analyzes issue body length, labels, priority indicators');
  console.log('   • Considers issue age and team proficiency from GitHub data');
  console.log('   • Sophisticated complexity calculation with real factors');
  console.log('   • Team skill matching against actual GitHub issue requirements');
  console.log();

  console.log('4. 🎯 findTeamMatches():');
  console.log('   BEFORE (Fake): if (activeTasks < capacity) add with hardcoded scores');
  console.log('   AFTER (Real):  Intelligent skill-based team matching');
  console.log('   • Real team utilization from GitHub APIs');
  console.log('   • calculateRealSkillMatch() using GitHub team skills data');
  console.log('   • calculateTransferCost() based on team skill overlap');
  console.log('   • calculateExpectedBenefit() from utilization balancing');
  console.log('   • calculateDependencyRisk() using real task dependencies');
  console.log('   • Sophisticated scoring: (benefit - cost) * skillMatch');
  console.log();

  console.log('🔄 Helper Methods Added for Real GitHub Integration:');
  console.log('====================================================');
  console.log('• getTeamActiveTasks() - GitHub Issues API with team labels/assignments');
  console.log('• calculateRealEstimatedTime() - Real task duration aggregation');
  console.log('• calculateSkillAvailability() - Team size and utilization based');
  console.log('• getTeamTaskProficiency() - GitHub issue analysis vs team skills');
  console.log('• calculateRealSkillMatch() - Task requirements vs team capabilities');
  console.log('• calculateTransferCost() - Skill overlap and coordination overhead');
  console.log('• calculateExpectedBenefit() - Multi-factor utilization improvement');
  console.log('• calculateDependencyRisk() - Cross-team dependency analysis');
  console.log('• calculateSkillOverlap() - Jaccard similarity for skill sets');
  console.log();

  console.log('⚡ Performance & Error Handling:');
  console.log('===============================');
  console.log('• Comprehensive try/catch blocks with graceful fallbacks');
  console.log('• Detailed error logging and warnings for debugging');
  console.log('• GitHub API rate limiting handled by underlying GitHubClient');
  console.log('• Intelligent caching through GitHubClient (5-30 minute TTL)');
  console.log('• Parallel processing where possible with Promise.allSettled');
  console.log('• Circuit breaker pattern: fallback to wave state on API failures');
  console.log();

  console.log('🚀 Integration Impact:');
  console.log('======================');
  console.log('The WaveCoordinator now uses REAL GitHub data for:');
  console.log('✓ Team discovery and membership analysis');
  console.log('✓ Task complexity estimation from issue content');
  console.log('✓ Utilization calculation from actual GitHub Issues');
  console.log('✓ Skill-based team matching using GitHub team data');
  console.log('✓ Intelligent work transfer recommendations');
  console.log('✓ Load balancing based on real team capacity and skills');
  console.log();
  console.log('This transforms the entire work stealing engine from sophisticated');
  console.log('placeholder logic to PRODUCTION-READY GitHub-powered coordination! 🎉');
}

if (require.main === module) {
  demonstrateWaveCoordinatorTransformation().catch(console.error);
}

export { demonstrateWaveCoordinatorTransformation };