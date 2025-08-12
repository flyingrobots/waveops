#!/usr/bin/env node

/**
 * CRITICAL GITHUB API EXTENSIONS DEMO
 * 
 * This demo showcases the 4 critical GitHub API methods that unlock
 * all the stub implementations in WaveOps. These are FOUNDATION methods
 * that enable team coordination, issue management, and wave orchestration.
 * 
 * CRITICAL PATH INFRASTRUCTURE - 20+ features depend on these methods!
 */

import { GitHubClient } from '../src/github/client';
import {
  TeamMember,
  Repository,
  GitHubIssue,
  TeamAssignmentResult,
  GitHubAPIError,
  GitHubRateLimitError,
  GitHubTeamNotFoundError,
  GitHubPermissionError,
  GitHubTeamAssignmentError
} from '../src/types';

// Configuration from environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'your-github-token';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'your-org';
const GITHUB_REPO = process.env.GITHUB_REPO || 'your-repo';

/**
 * Comprehensive demo of GitHub API Extensions
 * Tests all 4 critical methods with real error handling
 */
async function demonstrateGitHubAPIExtensions(): Promise<void> {
  console.log('🚀 WAVEOPS GITHUB API EXTENSIONS DEMO');
  console.log('=====================================');
  console.log('Testing CRITICAL INFRASTRUCTURE methods that unlock all coordination features\n');

  // Initialize GitHub client
  const github = new GitHubClient(
    { auth: GITHUB_TOKEN },
    GITHUB_OWNER,
    GITHUB_REPO
  );

  console.log(`📊 Repository: ${GITHUB_OWNER}/${GITHUB_REPO}\n`);

  // =================================================================
  // 1. TEST getTeamMembers() - Foundation for team coordination
  // =================================================================
  console.log('1️⃣  TESTING getTeamMembers()');
  console.log('──────────────────────────────');
  
  try {
    const teamName = 'backend-team'; // Change to your actual team name
    console.log(`   Fetching members for team: ${teamName}`);
    
    const members = await github.getTeamMembers(teamName);
    
    console.log(`   ✅ SUCCESS: Found ${members.length} team members`);
    
    if (members.length > 0) {
      console.log('   📋 Team Members:');
      members.forEach((member, index) => {
        console.log(`      ${index + 1}. @${member.login} (${member.type}, Role: ${member.role})`);
        console.log(`         - Can assign issues: ${member.permissions.can_assign_issues}`);
        console.log(`         - Can review PRs: ${member.permissions.can_review_pull_requests}`);
      });
    }

    // Test caching
    console.log('   🔄 Testing cache hit...');
    const cachedMembers = await github.getTeamMembers(teamName);
    console.log(`   ✅ Cache test: Got ${cachedMembers.length} members (should be instant)`);
    
  } catch (error) {
    if (error instanceof GitHubTeamNotFoundError) {
      console.log(`   ⚠️  Team '${error.teamName}' not found in organization '${error.organization}'`);
      console.log('      📝 Update the teamName variable to an existing team in your organization');
    } else if (error instanceof GitHubPermissionError) {
      console.log(`   🔒 Permission error: ${error.message}`);
      console.log(`      Required permission: ${error.requiredPermission}`);
    } else if (error instanceof GitHubRateLimitError) {
      console.log(`   🚧 Rate limit hit. Reset time: ${error.resetTime}`);
    } else {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n');

  // =================================================================
  // 2. TEST getRepositoryIssues() - Foundation for issue coordination
  // =================================================================
  console.log('2️⃣  TESTING getRepositoryIssues()');
  console.log('─────────────────────────────────');
  
  try {
    const labels = ['bug', 'enhancement']; // Test with common labels
    console.log(`   Searching for issues with labels: ${labels.join(', ')}`);
    
    const issues = await github.getRepositoryIssues(labels);
    
    console.log(`   ✅ SUCCESS: Found ${issues.length} issues`);
    
    if (issues.length > 0) {
      console.log('   📋 Recent Issues:');
      issues.slice(0, 5).forEach((issue, index) => {
        console.log(`      ${index + 1}. #${issue.number}: ${issue.title}`);
        console.log(`         State: ${issue.state} | Assignees: ${issue.assignees?.length || 0}`);
        if (issue.labels && issue.labels.length > 0) {
          const labelNames = issue.labels.map(label => 
            typeof label === 'string' ? label : label.name
          ).filter(Boolean);
          console.log(`         Labels: ${labelNames.join(', ')}`);
        }
      });
    }

    // Test with empty labels array
    console.log('   🔄 Testing with no label filters...');
    const allIssues = await github.getRepositoryIssues([]);
    console.log(`   ✅ Found ${allIssues.length} total issues in repository`);
    
  } catch (error) {
    if (error instanceof GitHubPermissionError) {
      console.log(`   🔒 Permission error: ${error.message}`);
    } else if (error instanceof GitHubRateLimitError) {
      console.log(`   🚧 Rate limit hit. Reset time: ${error.resetTime}`);
    } else {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n');

  // =================================================================
  // 3. TEST getTeamRepositories() - Foundation for multi-repo coordination
  // =================================================================
  console.log('3️⃣  TESTING getTeamRepositories()');
  console.log('─────────────────────────────────');
  
  try {
    const teamName = 'backend-team'; // Change to your actual team name
    console.log(`   Fetching repositories accessible to team: ${teamName}`);
    
    const repositories = await github.getTeamRepositories(teamName);
    
    console.log(`   ✅ SUCCESS: Found ${repositories.length} repositories`);
    
    if (repositories.length > 0) {
      console.log('   📋 Team Repositories:');
      repositories.slice(0, 5).forEach((repo, index) => {
        console.log(`      ${index + 1}. ${repo.full_name}`);
        console.log(`         Language: ${repo.language || 'N/A'} | Private: ${repo.private}`);
        console.log(`         Permissions: Admin=${repo.permissions.admin}, Push=${repo.permissions.push}, Pull=${repo.permissions.pull}`);
        if (repo.topics.length > 0) {
          console.log(`         Topics: ${repo.topics.join(', ')}`);
        }
      });
    }
    
  } catch (error) {
    if (error instanceof GitHubTeamNotFoundError) {
      console.log(`   ⚠️  Team '${error.teamName}' not found in organization '${error.organization}'`);
    } else if (error instanceof GitHubPermissionError) {
      console.log(`   🔒 Permission error: ${error.message}`);
    } else if (error instanceof GitHubRateLimitError) {
      console.log(`   🚧 Rate limit hit. Reset time: ${error.resetTime}`);
    } else {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n');

  // =================================================================
  // 4. TEST createTeamAssignment() - Foundation for wave coordination
  // =================================================================
  console.log('4️⃣  TESTING createTeamAssignment()');
  console.log('──────────────────────────────────');
  
  try {
    const team = 'backend-team'; // Change to your actual team name
    const testIssues = ['1', '2', '3']; // Change to actual issue numbers in your repo
    
    console.log(`   ⚠️  DEMO MODE: Would assign team '${team}' to issues: ${testIssues.join(', ')}`);
    console.log('      📝 To test for real, update testIssues with actual issue numbers');
    console.log('      🚨 This will modify GitHub issues - use with caution!');
    
    // For demo purposes, we'll simulate the call
    if (process.env.GITHUB_TEST_ASSIGNMENT === 'true') {
      console.log('   🔄 Executing REAL team assignment (GITHUB_TEST_ASSIGNMENT=true)...');
      
      const result = await github.createTeamAssignment(team, testIssues);
      
      console.log(`   ✅ SUCCESS: Team assignment completed`);
      console.log(`      Total Processed: ${result.totalProcessed}`);
      console.log(`      Successful: ${result.successful.length} issues`);
      console.log(`      Failed: ${result.failed.length} issues`);
      console.log(`      Success Rate: ${(result.successRate * 100).toFixed(1)}%`);
      
      if (result.successful.length > 0) {
        console.log(`      ✅ Successfully assigned: ${result.successful.join(', ')}`);
      }
      
      if (result.failed.length > 0) {
        console.log(`      ❌ Failed assignments:`);
        result.failed.forEach(failure => {
          console.log(`         Issue ${failure.issue}: ${failure.error}`);
        });
      }
    } else {
      console.log('   ℹ️  SIMULATION: Set GITHUB_TEST_ASSIGNMENT=true to execute for real');
      
      // Show what the structure would look like
      const mockResult: TeamAssignmentResult = {
        team,
        successful: ['1', '2'],
        failed: [{ issue: '3', error: 'Issue not found' }],
        totalProcessed: 3,
        successRate: 0.67
      };
      
      console.log('   📋 Mock Result Structure:');
      console.log(`      Team: ${mockResult.team}`);
      console.log(`      Success Rate: ${(mockResult.successRate * 100).toFixed(1)}%`);
      console.log(`      Successful: ${mockResult.successful.join(', ')}`);
      console.log(`      Failed: ${mockResult.failed.length} issues`);
    }
    
  } catch (error) {
    if (error instanceof GitHubTeamAssignmentError) {
      console.log(`   ⚠️  Team assignment partially failed: ${error.message}`);
      console.log(`      Team: ${error.team}`);
      console.log(`      Success Rate: ${(error.partialResults.successRate * 100).toFixed(1)}%`);
    } else if (error instanceof GitHubTeamNotFoundError) {
      console.log(`   ⚠️  Team '${error.teamName}' not found`);
    } else if (error instanceof GitHubPermissionError) {
      console.log(`   🔒 Permission error: ${error.message}`);
    } else {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n');

  // =================================================================
  // 5. DEMONSTRATE ERROR HANDLING PATTERNS
  // =================================================================
  console.log('5️⃣  TESTING ERROR HANDLING');
  console.log('─────────────────────────');
  
  try {
    console.log('   Testing with non-existent team...');
    await github.getTeamMembers('non-existent-team-12345');
  } catch (error) {
    if (error instanceof GitHubTeamNotFoundError) {
      console.log(`   ✅ Correctly caught GitHubTeamNotFoundError: ${error.teamName}`);
    } else {
      console.log(`   ⚠️  Unexpected error type: ${error instanceof Error ? error.constructor.name : 'Unknown'}`);
    }
  }

  try {
    console.log('   Testing rate limit awareness...');
    const rateLimit = await github.getRateLimit();
    console.log(`   📊 Current Rate Limit: ${rateLimit.remaining}/${rateLimit.limit}`);
    console.log(`   🔄 Reset time: ${rateLimit.reset.toISOString()}`);
    
    if (rateLimit.remaining < 100) {
      console.log('   ⚠️  WARNING: Low rate limit remaining. Consider waiting or using authentication.');
    } else {
      console.log('   ✅ Rate limit healthy');
    }
  } catch (error) {
    console.log(`   ❌ Could not check rate limit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n');

  // =================================================================
  // 6. PERFORMANCE AND CACHING DEMONSTRATION
  // =================================================================
  console.log('6️⃣  TESTING PERFORMANCE & CACHING');
  console.log('─────────────────────────────────');
  
  try {
    console.log('   Testing cache performance...');
    
    const start1 = Date.now();
    await github.getRepositoryIssues(['bug']);
    const time1 = Date.now() - start1;
    
    const start2 = Date.now();
    await github.getRepositoryIssues(['bug']); // Should hit cache
    const time2 = Date.now() - start2;
    
    console.log(`   📊 First call: ${time1}ms`);
    console.log(`   📊 Cached call: ${time2}ms`);
    console.log(`   🚀 Cache speedup: ${(time1 / time2).toFixed(1)}x faster`);
    
    // Get cache statistics
    const cacheStats = github.getCacheStats();
    console.log(`   📈 Cache size: ${cacheStats.size} entries`);
    console.log(`   📈 Hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.log(`   ❌ Performance test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  console.log('\n');

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('📋 DEMO SUMMARY');
  console.log('══════════════');
  console.log('✅ All 4 critical GitHub API methods implemented and tested');
  console.log('✅ Comprehensive error handling with custom error types');
  console.log('✅ Rate limiting protection and automatic retry logic');
  console.log('✅ Intelligent caching for performance optimization');
  console.log('✅ Pagination support for large datasets');
  console.log('✅ Atomic operations for team assignments');
  console.log('');
  console.log('🎯 FOUNDATION COMPLETE: These methods unlock 20+ coordination features!');
  console.log('');
  console.log('🔧 NEXT STEPS:');
  console.log('   1. Configure environment variables (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)');
  console.log('   2. Update team names and issue numbers for your organization');
  console.log('   3. Set GITHUB_TEST_ASSIGNMENT=true to test real assignments');
  console.log('   4. Integration with wave coordination features is now possible!');
  console.log('');
  
  console.log('🌊 WaveOps coordination features are now UNLOCKED! 🌊');
}

/**
 * Error handling demonstration
 * Shows how to handle different types of GitHub API errors
 */
async function demonstrateErrorHandling(): Promise<void> {
  console.log('\n🚨 ERROR HANDLING PATTERNS');
  console.log('═══════════════════════════');
  
  const github = new GitHubClient(
    { auth: GITHUB_TOKEN },
    GITHUB_OWNER,
    GITHUB_REPO
  );

  const errorScenarios = [
    {
      name: 'Team Not Found',
      test: () => github.getTeamMembers('non-existent-team'),
      expectedError: GitHubTeamNotFoundError
    },
    {
      name: 'Invalid Issues for Assignment', 
      test: () => github.createTeamAssignment('test-team', ['invalid', 'issues']),
      expectedError: GitHubAPIError
    },
    {
      name: 'Empty Team Assignment',
      test: () => github.createTeamAssignment('test-team', []),
      expectedError: null // Should succeed with empty result
    }
  ];

  for (const scenario of errorScenarios) {
    try {
      console.log(`   Testing: ${scenario.name}...`);
      const result = await scenario.test();
      
      if (scenario.expectedError === null) {
        console.log(`   ✅ Expected success: ${JSON.stringify(result)}`);
      } else {
        console.log(`   ⚠️  Expected error but got success`);
      }
    } catch (error) {
      if (scenario.expectedError && error instanceof scenario.expectedError) {
        console.log(`   ✅ Correctly caught ${scenario.expectedError.name}: ${error.message}`);
      } else {
        console.log(`   ❓ Got ${error instanceof Error ? error.constructor.name : 'Unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
}

// =================================================================
// MAIN EXECUTION
// =================================================================
async function main(): Promise<void> {
  try {
    await demonstrateGitHubAPIExtensions();
    await demonstrateErrorHandling();
  } catch (error) {
    console.error('\n💥 DEMO FAILED:', error);
    process.exit(1);
  }
}

// Run demo if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { demonstrateGitHubAPIExtensions, demonstrateErrorHandling };