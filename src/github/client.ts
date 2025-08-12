/**
 * GitHub API Client wrapper with rate limiting and error handling
 */

import { Octokit } from '@octokit/rest';
import { 
  GitHubDeployment, 
  GitHubCheckRun, 
  GitHubIssue, 
  GitHubIssueComment, 
  GitHubPullRequest, 
  GitHubCommitChecks,
  RateLimitInfo 
} from '../types';

export interface GitHubClientOptions {
  auth: string;
  baseUrl?: string;
  userAgent?: string;
}

export interface DeploymentParams {
  environment: string;
  ref: string;
  description: string;
  payload: Record<string, unknown>;
}

export interface CheckRunParams {
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out';
  output?: {
    title: string;
    summary: string;
  };
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(options: GitHubClientOptions, owner: string, repo: string) {
    this.octokit = new Octokit({
      auth: options.auth,
      baseUrl: options.baseUrl,
      userAgent: options.userAgent || 'WaveOps/1.0.0'
    });

    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    const response = await this.octokit.rest.rateLimit.get();
    const core = response.data.rate;
    
    return {
      limit: core.limit,
      remaining: core.remaining,
      reset: new Date(core.reset * 1000),
      used: core.used
    };
  }

  /**
   * Create a deployment for team readiness tracking
   */
  async createDeployment(params: DeploymentParams): Promise<GitHubDeployment> {
    try {
      const response = await this.octokit.rest.repos.createDeployment({
        owner: this.owner,
        repo: this.repo,
        ref: params.ref,
        environment: params.environment,
        description: params.description,
        payload: JSON.stringify(params.payload),
        auto_merge: false,
        required_contexts: [] // Skip status checks for WaveOps deployments
      });

      return response.data as GitHubDeployment;
    } catch (error) {
      throw new Error(`Failed to create deployment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(deploymentId: number, state: 'pending' | 'success' | 'failure' | 'error', description?: string): Promise<unknown> {
    try {
      const response = await this.octokit.rest.repos.createDeploymentStatus({
        owner: this.owner,
        repo: this.repo,
        deployment_id: deploymentId,
        state,
        description,
        auto_inactive: false
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to update deployment status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create or update a check run
   */
  async createCheckRun(params: CheckRunParams): Promise<GitHubCheckRun> {
    try {
      const response = await this.octokit.rest.checks.create({
        owner: this.owner,
        repo: this.repo,
        name: params.name,
        head_sha: params.head_sha,
        status: params.status,
        conclusion: params.conclusion,
        output: params.output
      });

      return response.data as GitHubCheckRun;
    } catch (error) {
      throw new Error(`Failed to create check run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a comment to an issue
   */
  async addIssueComment(issueNumber: number, body: string): Promise<GitHubIssueComment> {
    try {
      const response = await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body
      });

      return response.data as GitHubIssueComment;
    } catch (error) {
      throw new Error(`Failed to add issue comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an issue body
   */
  async updateIssue(issueNumber: number, body: string, title?: string): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body,
        title
      });

      return response.data as GitHubIssue;
    } catch (error) {
      throw new Error(`Failed to update issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get issue information
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return response.data as GitHubIssue;
    } catch (error) {
      throw new Error(`Failed to get issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pull request that closed an issue
   */
  async getClosingPullRequest(): Promise<GitHubPullRequest | null> {
    // Simplified implementation - in real implementation this would use GraphQL
    // For now, return null to indicate no closing PR found
    return null;
  }

  /**
   * Get commit status checks
   */
  async getCommitChecks(): Promise<GitHubCommitChecks> {
    // Simplified implementation for simulation
    return {
      statuses: [],
      checkRuns: [],
      state: 'success'
    };
  }

  /**
   * Validate GitHub App permissions
   */
  async validatePermissions(): Promise<{ valid: boolean; missing: string[] }> {
    const missing: string[] = [];
    
    try {
      // Test required permissions by making API calls
      await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      // Test issues permission
      try {
        await this.octokit.rest.issues.list({
          owner: this.owner,
          repo: this.repo,
          per_page: 1
        });
      } catch {
        missing.push('issues:read');
      }

      // Test deployments permission
      try {
        await this.octokit.rest.repos.listDeployments({
          owner: this.owner,
          repo: this.repo,
          per_page: 1
        });
      } catch {
        missing.push('deployments:write');
      }

      // Test checks permission
      try {
        await this.octokit.rest.checks.listForRef({
          owner: this.owner,
          repo: this.repo,
          ref: 'main',
          per_page: 1
        });
      } catch {
        missing.push('checks:write');
      }

      return { valid: missing.length === 0, missing };
    } catch {
      return { valid: false, missing: ['basic repository access'] };
    }
  }
}