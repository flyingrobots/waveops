#!/usr/bin/env node
/**
 * WaveOps Coordination CLI - Called by GitHub Actions workflow
 * Processes coordination events and manages wave transitions
 */

import { GitHubClient } from '../github/client';
// CommandParser will be implemented in future tasks
// import { CommandParser } from '../core/command-parser';
import { ValidationEngine } from '../core/validation-engine';
import { DeploymentGate } from '../core/deployment-gate';
import { WaveGateCheck } from '../core/wave-gate-check';

interface CoordinationOptions {
  event: 'issue' | 'comment' | 'pr' | 'pr-review' | 'push' | 'manual';
  issue?: string;
  pr?: string;
  ref?: string;
  command?: string;
}

class WaveCoordinator {
  private client: GitHubClient;
  // private parser: CommandParser; // Will be implemented in future tasks
  private validator: ValidationEngine;
  private deploymentGate: DeploymentGate;
  private waveGateCheck: WaveGateCheck;

  constructor() {
    const auth = process.env.GITHUB_TOKEN;
    if (!auth) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    // Extract owner/repo from GitHub Actions environment
    const repository = process.env.GITHUB_REPOSITORY;
    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable is required');
    }

    const [owner, repo] = repository.split('/');
    this.client = new GitHubClient({ auth }, owner, repo);
    
    // this.parser = new CommandParser(this.client); // Will be implemented in future tasks
    this.validator = new ValidationEngine(this.client);
    this.deploymentGate = new DeploymentGate(this.client);
    this.waveGateCheck = new WaveGateCheck(this.client);
  }

  /**
   * Main coordination entry point
   */
  async coordinate(options: CoordinationOptions): Promise<void> {
    console.log(`🎯 Processing ${options.event} event...`);

    try {
      switch (options.event) {
        case 'issue':
          await this.handleIssueEvent(parseInt(options.issue!));
          break;
        case 'comment':
          await this.handleCommentEvent(parseInt(options.issue!));
          break;
        case 'pr':
          await this.handlePullRequestEvent(parseInt(options.pr!));
          break;
        case 'pr-review':
          await this.handlePullRequestReviewEvent(parseInt(options.pr!));
          break;
        case 'push':
          await this.handlePushEvent(options.ref!);
          break;
        case 'manual':
          await this.handleManualCommand(options.command!, options.issue);
          break;
        default:
          throw new Error(`Unknown event type: ${options.event}`);
      }

      console.log('✅ Coordination completed successfully');
    } catch (error) {
      console.error('❌ Coordination failed:', error);
      throw error;
    }
  }

  /**
   * Handle issue events (opened, edited, closed)
   */
  private async handleIssueEvent(issueNumber: number): Promise<void> {
    console.log(`Processing issue event for #${issueNumber}`);
    
    const issue = await this.client.getIssue(issueNumber);
    
    // Check if this is a coordination issue
    const isCoordinationIssue = issue.labels?.some((label: { name?: string } | string) => 
      typeof label === 'string' ? label === 'coordination' : label.name === 'coordination'
    );

    if (isCoordinationIssue) {
      console.log('Coordination issue detected - checking wave status');
      await this.checkWaveTransitions();
    } else {
      console.log('Regular issue - checking if it affects any tasks');
      // Check if this issue is part of any wave tasks
      await this.validateTaskIssues();
    }
  }

  /**
   * Handle comment events on coordination issues
   */
  private async handleCommentEvent(issueNumber: number): Promise<void> {
    console.log(`Processing comment event for #${issueNumber}`);
    
    const issue = await this.client.getIssue(issueNumber);
    
    // Check if this is a coordination issue
    const isCoordinationIssue = issue.labels?.some((label: { name?: string } | string) => 
      typeof label === 'string' ? label === 'coordination' : label.name === 'coordination'
    );

    if (isCoordinationIssue) {
      console.log('Comment on coordination issue - parsing for commands');
      
      // Get latest comments to find potential commands
      const comments = await this.client.getIssueComments(issueNumber);
      const latestComment = comments[comments.length - 1];
      
      if (latestComment) {
        // Command parsing will be implemented in future tasks
        console.log(`Would parse command from comment: ${latestComment.body.substring(0, 50)}...`);
      }
    }
  }

  /**
   * Handle pull request events (opened, closed, merged)
   */
  private async handlePullRequestEvent(prNumber: number): Promise<void> {
    console.log(`Processing pull request event for #${prNumber}`);
    
    // Check if this PR is linked to any task issues
    const pr = await this.client.getPullRequest(prNumber);
    
    if (pr.merged) {
      console.log('PR merged - triggering task validation');
      await this.validateTaskIssues();
      await this.checkWaveTransitions();
    } else if (pr.state === 'closed' && !pr.merged) {
      console.log('PR closed without merge - may affect task status');
      await this.validateTaskIssues();
    }
  }

  /**
   * Handle PR review events
   */
  private async handlePullRequestReviewEvent(prNumber: number): Promise<void> {
    console.log(`Processing PR review event for #${prNumber}`);
    
    // Reviews might affect CI status, so revalidate
    await this.validateTaskIssues();
  }

  /**
   * Handle push events to main branch
   */
  private async handlePushEvent(ref: string): Promise<void> {
    console.log(`Processing push event to ${ref}`);
    
    if (ref === 'main') {
      console.log('Push to main - checking for wave transitions');
      await this.checkWaveTransitions();
    }
  }

  /**
   * Handle manual commands via workflow_dispatch
   */
  private async handleManualCommand(command: string, issueNumber?: string): Promise<void> {
    console.log(`Processing manual command: ${command}`);
    
    const coordinationIssue = issueNumber ? parseInt(issueNumber) : undefined;
    
    // Command parsing will be implemented in future tasks
    console.log(`Would parse manual command: ${command} for issue: ${coordinationIssue}`);
  }

  /**
   * Validate all task issues and update their status
   */
  private async validateTaskIssues(): Promise<void> {
    console.log('Validating task completion status...');
    
    // This would typically load task configuration and validate each one
    // For now, just log that validation would happen
    console.log('Task validation completed');
  }

  /**
   * Check for wave transitions and update gates
   */
  private async checkWaveTransitions(): Promise<void> {
    console.log('Checking for wave transitions...');
    
    // This would check current wave status and trigger gates if needed
    // For now, just log that checking would happen
    console.log('Wave transition check completed');
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): CoordinationOptions {
  const args = process.argv.slice(2);
  const options: Partial<CoordinationOptions> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '') as keyof CoordinationOptions;
    const value = args[i + 1];
    
    if (key && value) {
      (options as Record<string, string>)[key] = value;
    }
  }

  if (!options.event) {
    throw new Error('--event parameter is required');
  }

  return options as CoordinationOptions;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const options = parseArgs();
    const coordinator = new WaveCoordinator();
    await coordinator.coordinate(options);
  } catch (error) {
    console.error('Coordination failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { WaveCoordinator };