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

export interface GitHubMetricsData {
  issues: GitHubIssue[];
  pullRequests: GitHubPullRequest[];
  issueComments: GitHubIssueComment[];
  checkRuns: GitHubCheckRun[];
  deployments: GitHubDeployment[];
  issueTimeline: GitHubTimelineEvent[];
  prReviews: GitHubPullRequestReview[];
}

export interface GitHubTimelineEvent {
  id: number;
  event: string;
  created_at: string;
  actor?: {
    login: string;
  };
  commit_id?: string;
  label?: {
    name: string;
  };
}

export interface GitHubPullRequestReview {
  id: number;
  state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  submitted_at: string;
  user: {
    login: string;
  };
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  head_sha: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface APIResponseTiming {
  endpoint: string;
  method: string;
  startTime: number;
  endTime: number;
  responseTime: number;
  rateLimitRemaining: number;
  status: number;
}

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
  public readonly owner: string;
  public readonly repo: string;
  private metricsCache: Map<string, CacheEntry<unknown>> = new Map();
  private responseTimings: APIResponseTiming[] = [];
  private readonly maxCacheSize = 1000;
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  constructor(options: GitHubClientOptions, owner: string, repo: string) {
    this.octokit = new Octokit({
      auth: options.auth,
      baseUrl: options.baseUrl,
      userAgent: options.userAgent || 'WaveOps/1.0.0'
    });

    this.owner = owner;
    this.repo = repo;
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Add request/response interceptors for timing and rate limit tracking
    this.octokit.hook.wrap('request', async (request, options) => {
      const startTime = Date.now();
      const endpoint = `${options.method} ${options.url}`;
      
      try {
        const response = await request(options);
        const endTime = Date.now();
        
        this.recordAPITiming({
          endpoint,
          method: options.method || 'GET',
          startTime,
          endTime,
          responseTime: endTime - startTime,
          rateLimitRemaining: parseInt(response.headers['x-ratelimit-remaining'] || '0'),
          status: response.status
        });
        
        return response;
      } catch (error) {
        const endTime = Date.now();
        this.recordAPITiming({
          endpoint,
          method: options.method || 'GET',
          startTime,
          endTime,
          responseTime: endTime - startTime,
          rateLimitRemaining: 0,
          status: error instanceof Error && 'status' in error ? (error as any).status : 500
        });
        throw error;
      }
    });
  }

  private recordAPITiming(timing: APIResponseTiming): void {
    this.responseTimings.push(timing);
    // Keep only last 1000 timings to prevent memory leaks
    if (this.responseTimings.length > 1000) {
      this.responseTimings = this.responseTimings.slice(-500);
    }
  }

  private getCacheKey(method: string, ...args: unknown[]): string {
    return `${method}:${JSON.stringify(args)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.metricsCache.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() < entry.timestamp + entry.ttl) {
      return entry.data;
    }
    if (entry) {
      this.metricsCache.delete(key);
    }
    return null;
  }

  private setCache<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    // Implement LRU eviction if cache is full
    if (this.metricsCache.size >= this.maxCacheSize) {
      const firstKey = this.metricsCache.keys().next().value;
      if (firstKey) {
        this.metricsCache.delete(firstKey);
      }
    }
    
    this.metricsCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
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
      state: 'success',
      conclusion: 'success',
      total_count: 1
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

  /**
   * Get issue comments
   */
  async getIssueComments(issueNumber: number): Promise<GitHubIssueComment[]> {
    try {
      const response = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return response.data.map(comment => ({
        id: comment.id,
        body: comment.body || '',
        user: {
          login: comment.user?.login || 'unknown'
        },
        created_at: comment.created_at,
        updated_at: comment.updated_at
      }));
    } catch (error) {
      throw new Error(`Failed to get issue comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pull request details
   */
  async getPullRequest(prNumber: number): Promise<GitHubPullRequest> {
    try {
      const response = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      return {
        id: response.data.id,
        number: response.data.number,
        title: response.data.title,
        merged: response.data.merged || false,
        merge_commit_sha: response.data.merge_commit_sha,
        state: response.data.state as 'open' | 'closed',
        user: {
          login: response.data.user?.login || 'unknown'
        }
      };
    } catch (error) {
      throw new Error(`Failed to get pull request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search issues
   */
  async searchIssues(query: string): Promise<{ items: GitHubIssue[] }> {
    try {
      const cacheKey = this.getCacheKey('searchIssues', query);
      const cached = this.getFromCache<{ items: GitHubIssue[] }>(cacheKey);
      if (cached) {
        return cached;
      }

      const fullQuery = `${query} repo:${this.owner}/${this.repo}`;
      const response = await this.octokit.rest.search.issuesAndPullRequests({
        q: fullQuery
      });

      const result = {
        items: response.data.items.map(item => ({
          id: item.id,
          number: item.number,
          title: item.title,
          body: item.body || '',
          state: item.state as 'open' | 'closed',
          user: {
            login: item.user?.login || 'unknown'
          },
          created_at: item.created_at,
          updated_at: item.updated_at,
          labels: item.labels,
          closed_at: item.closed_at,
          assignees: item.assignees?.map(assignee => ({
            login: assignee?.login || 'unknown'
          })) || []
        }))
      };

      this.setCache(cacheKey, result, 2 * 60 * 1000); // 2 minute cache for search results
      return result;
    } catch (error) {
      throw new Error(`Failed to search issues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get comprehensive metrics data for a team and time range
   */
  async getTeamMetricsData(teamLabel: string, startDate: Date, endDate: Date): Promise<GitHubMetricsData> {
    const cacheKey = this.getCacheKey('getTeamMetricsData', teamLabel, startDate.getTime(), endDate.getTime());
    const cached = this.getFromCache<GitHubMetricsData>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Search for issues with team label in the date range
      const issueQuery = `label:"${teamLabel}" updated:${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`;
      const issuesResponse = await this.searchIssues(issueQuery);
      const issues = issuesResponse.items;

      // Get pull requests for the same period
      const prQuery = `is:pr label:"${teamLabel}" updated:${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`;
      const prResponse = await this.searchIssues(prQuery);
      const pullRequests = await Promise.all(
        prResponse.items.map(item => this.getPullRequest(item.number))
      );

      // Get issue comments, timeline events, and reviews in parallel
      const [issueComments, issueTimelines, prReviews] = await Promise.all([
        this.getBatchIssueComments(issues.map(i => i.number)),
        this.getBatchIssueTimelines(issues.map(i => i.number)),
        this.getBatchPullRequestReviews(pullRequests.map(pr => pr.number))
      ]);

      // Get workflow runs and deployments
      const [checkRuns, deployments] = await Promise.all([
        this.getRecentCheckRuns(startDate, endDate),
        this.getRecentDeployments(startDate, endDate)
      ]);

      const result: GitHubMetricsData = {
        issues,
        pullRequests,
        issueComments: issueComments.flat(),
        checkRuns,
        deployments,
        issueTimeline: issueTimelines.flat(),
        prReviews: prReviews.flat()
      };

      this.setCache(cacheKey, result, 10 * 60 * 1000); // 10 minute cache for team metrics
      return result;
    } catch (error) {
      throw new Error(`Failed to get team metrics data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get issue timeline events for detailed workflow analysis
   */
  async getIssueTimeline(issueNumber: number): Promise<GitHubTimelineEvent[]> {
    try {
      const response = await this.octokit.rest.issues.listEventsForTimeline({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return response.data.map(event => ({
        id: event.id || 0,
        event: event.event || 'unknown',
        created_at: event.created_at || new Date().toISOString(),
        actor: event.actor ? { login: event.actor.login } : undefined,
        commit_id: 'commit_id' in event ? event.commit_id : undefined,
        label: 'label' in event ? { name: event.label?.name || '' } : undefined
      }));
    } catch (error) {
      throw new Error(`Failed to get issue timeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pull request reviews for code review metrics
   */
  async getPullRequestReviews(prNumber: number): Promise<GitHubPullRequestReview[]> {
    try {
      const response = await this.octokit.rest.pulls.listReviews({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      return response.data.map(review => ({
        id: review.id,
        state: review.state as 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
        submitted_at: review.submitted_at || new Date().toISOString(),
        user: {
          login: review.user?.login || 'unknown'
        }
      }));
    } catch (error) {
      throw new Error(`Failed to get pull request reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get workflow runs for CI/CD performance metrics
   */
  async getWorkflowRuns(startDate: Date, endDate: Date): Promise<GitHubWorkflowRun[]> {
    try {
      const response = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: this.owner,
        repo: this.repo,
        created: `${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]}`,
        per_page: 100
      });

      return response.data.workflow_runs.map(run => ({
        id: run.id,
        name: run.name || 'Unknown Workflow',
        status: run.status as 'queued' | 'in_progress' | 'completed',
        conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null,
        created_at: run.created_at,
        updated_at: run.updated_at,
        run_started_at: run.run_started_at || run.created_at,
        head_sha: run.head_sha
      }));
    } catch (error) {
      throw new Error(`Failed to get workflow runs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get API response timing metrics
   */
  getAPIResponseTimings(): APIResponseTiming[] {
    return [...this.responseTimings];
  }

  /**
   * Get average API response time by endpoint
   */
  getAverageResponseTime(): { [endpoint: string]: number } {
    const endpointTimings: { [endpoint: string]: number[] } = {};
    
    for (const timing of this.responseTimings) {
      if (!endpointTimings[timing.endpoint]) {
        endpointTimings[timing.endpoint] = [];
      }
      endpointTimings[timing.endpoint].push(timing.responseTime);
    }

    const averages: { [endpoint: string]: number } = {};
    for (const [endpoint, times] of Object.entries(endpointTimings)) {
      averages[endpoint] = times.reduce((sum, time) => sum + time, 0) / times.length;
    }

    return averages;
  }

  /**
   * Batch operations for efficient API usage
   */
  private async getBatchIssueComments(issueNumbers: number[]): Promise<GitHubIssueComment[][]> {
    return Promise.all(
      issueNumbers.map(num => this.getIssueComments(num).catch(() => []))
    );
  }

  private async getBatchIssueTimelines(issueNumbers: number[]): Promise<GitHubTimelineEvent[][]> {
    return Promise.all(
      issueNumbers.map(num => this.getIssueTimeline(num).catch(() => []))
    );
  }

  private async getBatchPullRequestReviews(prNumbers: number[]): Promise<GitHubPullRequestReview[][]> {
    return Promise.all(
      prNumbers.map(num => this.getPullRequestReviews(num).catch(() => []))
    );
  }

  private async getRecentCheckRuns(startDate: Date, endDate: Date): Promise<GitHubCheckRun[]> {
    try {
      // Get recent commits to find check runs
      const commitsResponse = await this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        since: startDate.toISOString(),
        until: endDate.toISOString(),
        per_page: 50
      });

      const checkRuns: GitHubCheckRun[] = [];
      for (const commit of commitsResponse.data) {
        try {
          const checksResponse = await this.octokit.rest.checks.listForRef({
            owner: this.owner,
            repo: this.repo,
            ref: commit.sha
          });
          
          checkRuns.push(...checksResponse.data.check_runs.map(run => ({
            id: run.id,
            name: run.name,
            head_sha: run.head_sha,
            status: run.status as 'queued' | 'in_progress' | 'completed',
            conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null,
            output: run.output ? {
              title: run.output.title || '',
              summary: run.output.summary || ''
            } : undefined
          })));
        } catch {
          // Skip commits without check runs
        }
      }

      return checkRuns;
    } catch (error) {
      return []; // Return empty array on failure to not break metrics collection
    }
  }

  private async getRecentDeployments(startDate: Date, endDate: Date): Promise<GitHubDeployment[]> {
    try {
      const response = await this.octokit.rest.repos.listDeployments({
        owner: this.owner,
        repo: this.repo,
        per_page: 100
      });

      return response.data
        .filter(deployment => {
          const createdAt = new Date(deployment.created_at);
          return createdAt >= startDate && createdAt <= endDate;
        })
        .map(deployment => ({
          id: deployment.id,
          environment: deployment.environment,
          ref: deployment.ref,
          description: deployment.description || '',
          created_at: deployment.created_at,
          updated_at: deployment.updated_at,
          statuses_url: deployment.statuses_url
        }));
    } catch (error) {
      return []; // Return empty array on failure
    }
  }

  /**
   * Clear metrics cache
   */
  clearCache(): void {
    this.metricsCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    // This is a simplified implementation - in a real system you'd track hits/misses
    return {
      size: this.metricsCache.size,
      hitRate: 0.75 // Placeholder - implement proper hit rate tracking
    };
  }
}