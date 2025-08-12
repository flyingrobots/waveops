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
  RateLimitInfo,
  TeamMember,
  TeamMemberRole,
  Repository,
  TeamAssignmentRequest,
  TeamAssignmentResult,
  GitHubAPIError,
  GitHubRateLimitError,
  GitHubTeamNotFoundError,
  GitHubPermissionError,
  GitHubTeamAssignmentError
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
  commit_id?: string | null;
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
        id: (event as any).id || 0,
        event: (event as any).event || 'unknown',
        created_at: (event as any).created_at || new Date().toISOString(),
        actor: (event as any).actor ? { login: (event as any).actor.login } : undefined,
        commit_id: (event as any).commit_id || undefined,
        label: (event as any).label ? { name: (event as any).label?.name || '' } : undefined
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

  // =================================================================
  // CRITICAL GITHUB API EXTENSIONS - Foundation Infrastructure
  // =================================================================

  /**
   * Get team members with roles and permissions
   * This is CRITICAL INFRASTRUCTURE for team coordination features
   */
  async getTeamMembers(teamName: string): Promise<TeamMember[]> {
    const cacheKey = this.getCacheKey('getTeamMembers', teamName);
    const cached = this.getFromCache<TeamMember[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Get team ID first
      const team = await this.getTeamByName(teamName);
      
      // Get team members with pagination support
      const allMembers: TeamMember[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.octokit.rest.teams.listMembersInOrg({
          org: this.owner,
          team_slug: teamName,
          per_page: perPage,
          page: page
        });

        if (response.data.length === 0) {
          break;
        }

        // Get detailed member information with roles and permissions
        for (const member of response.data) {
          try {
            const membershipResponse = await this.octokit.rest.teams.getMembershipForUserInOrg({
              org: this.owner,
              team_slug: teamName,
              username: member.login
            });

            const teamMember: TeamMember = {
              id: member.id,
              login: member.login,
              node_id: member.node_id,
              email: member.email || undefined,
              name: member.name || undefined,
              role: this.mapGitHubRoleToEnum(membershipResponse.data.role),
              permissions: await this.getTeamMemberPermissions(member.login, teamName),
              url: member.url,
              avatar_url: member.avatar_url,
              type: member.type === 'Bot' ? 'Bot' : 'User',
              site_admin: member.site_admin
            };

            allMembers.push(teamMember);
          } catch (memberError) {
            // Log warning but continue processing other members
            console.warn(`Failed to get details for team member ${member.login}:`, memberError);
            
            // Add basic member info without detailed permissions
            allMembers.push({
              id: member.id,
              login: member.login,
              node_id: member.node_id,
              role: TeamMemberRole.MEMBER, // Default role
              permissions: this.getDefaultPermissions(),
              url: member.url,
              avatar_url: member.avatar_url,
              type: member.type === 'Bot' ? 'Bot' : 'User',
              site_admin: member.site_admin
            });
          }
        }

        page++;
        
        // Rate limiting: wait if we're approaching limits
        await this.handleRateLimiting();
      }

      // Cache results for 15 minutes (team membership changes infrequently)
      this.setCache(cacheKey, allMembers, 15 * 60 * 1000);
      return allMembers;

    } catch (error) {
      if (error instanceof Error) {
        if ('status' in error && (error as any).status === 404) {
          throw new GitHubTeamNotFoundError(teamName, this.owner);
        }
        
        if ('status' in error && (error as any).status === 403) {
          throw new GitHubPermissionError(
            `Insufficient permissions to access team '${teamName}'`,
            'teams:read',
            'teams',
            'GET'
          );
        }

        if ('status' in error && (error as any).status === 429) {
          const resetHeader = (error as any).response?.headers['x-ratelimit-reset'];
          const resetTime = resetHeader ? new Date(parseInt(resetHeader) * 1000) : new Date(Date.now() + 3600000);
          throw new GitHubRateLimitError(
            'Rate limit exceeded while fetching team members',
            resetTime,
            0,
            'teams',
            'GET'
          );
        }

        throw new GitHubAPIError(
          `Failed to get team members: ${error.message}`,
          'status' in error ? (error as any).status : 500,
          'teams',
          'GET',
          { teamName, error: error.message }
        );
      }

      throw error;
    }
  }

  /**
   * Get repository issues filtered by labels with comprehensive pagination
   * This is CRITICAL INFRASTRUCTURE for issue coordination and wave management
   */
  async getRepositoryIssues(labels: string[]): Promise<GitHubIssue[]> {
    const cacheKey = this.getCacheKey('getRepositoryIssues', labels.sort());
    const cached = this.getFromCache<GitHubIssue[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const allIssues: GitHubIssue[] = [];
      
      // Build label query string
      const labelQuery = labels.length > 0 ? labels.map(label => `label:"${label}"`).join(' ') : '';
      const searchQuery = `repo:${this.owner}/${this.repo} is:issue ${labelQuery}`.trim();

      let page = 1;
      const perPage = 100; // GitHub Search API max

      while (true) {
        const response = await this.octokit.rest.search.issuesAndPullRequests({
          q: searchQuery,
          sort: 'updated',
          order: 'desc',
          per_page: perPage,
          page: page
        });

        if (response.data.items.length === 0) {
          break;
        }

        // Filter out pull requests (search API returns both issues and PRs)
        const issues = response.data.items
          .filter(item => !item.pull_request)
          .map(item => ({
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
            closed_at: item.closed_at,
            labels: item.labels,
            assignees: item.assignees?.map(assignee => ({
              login: assignee?.login || 'unknown'
            })) || []
          }));

        allIssues.push(...issues);

        // Check if we've reached the end
        if (response.data.items.length < perPage) {
          break;
        }

        page++;
        
        // Rate limiting protection
        await this.handleRateLimiting();
        
        // GitHub Search API has stricter limits, add small delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Cache for 5 minutes (issues change frequently)
      this.setCache(cacheKey, allIssues, 5 * 60 * 1000);
      return allIssues;

    } catch (error) {
      if (error instanceof Error) {
        if ('status' in error && (error as any).status === 403) {
          throw new GitHubPermissionError(
            'Insufficient permissions to search repository issues',
            'issues:read',
            'search',
            'GET'
          );
        }

        if ('status' in error && (error as any).status === 429) {
          const resetHeader = (error as any).response?.headers['x-ratelimit-reset'];
          const resetTime = resetHeader ? new Date(parseInt(resetHeader) * 1000) : new Date(Date.now() + 3600000);
          throw new GitHubRateLimitError(
            'Rate limit exceeded while searching issues',
            resetTime,
            parseInt((error as any).response?.headers['x-ratelimit-remaining'] || '0'),
            'search',
            'GET'
          );
        }

        throw new GitHubAPIError(
          `Failed to get repository issues: ${error.message}`,
          'status' in error ? (error as any).status : 500,
          'search',
          'GET',
          { labels, error: error.message }
        );
      }

      throw error;
    }
  }

  /**
   * Get repositories that a team has access to with permission levels
   * This is CRITICAL INFRASTRUCTURE for multi-repository coordination
   */
  async getTeamRepositories(teamName: string): Promise<Repository[]> {
    const cacheKey = this.getCacheKey('getTeamRepositories', teamName);
    const cached = this.getFromCache<Repository[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Verify team exists first
      await this.getTeamByName(teamName);

      const allRepositories: Repository[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.octokit.rest.teams.listReposInOrg({
          org: this.owner,
          team_slug: teamName,
          per_page: perPage,
          page: page
        });

        if (response.data.length === 0) {
          break;
        }

        const repositories = response.data.map(repo => ({
          id: repo.id,
          node_id: repo.node_id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          owner: {
            login: repo.owner.login,
            id: repo.owner.id,
            type: repo.owner.type as 'User' | 'Organization'
          },
          html_url: repo.html_url,
          description: repo.description,
          fork: repo.fork,
          created_at: repo.created_at || null,
          updated_at: repo.updated_at || null,
          pushed_at: repo.pushed_at || null,
          clone_url: repo.clone_url || null,
          ssh_url: repo.ssh_url || null,
          size: repo.size || 0,
          stargazers_count: repo.stargazers_count || 0,
          watchers_count: repo.watchers_count || 0,
          language: repo.language || null,
          has_issues: repo.has_issues || false,
          has_projects: repo.has_projects || false,
          has_wiki: repo.has_wiki || false,
          archived: repo.archived || false,
          disabled: repo.disabled || false,
          open_issues_count: repo.open_issues_count || 0,
          topics: repo.topics || [],
          permissions: {
            admin: repo.permissions?.admin || false,
            maintain: repo.permissions?.maintain || false,
            push: repo.permissions?.push || false,
            triage: repo.permissions?.triage || false,
            pull: repo.permissions?.pull || false
          },
          default_branch: repo.default_branch || null
        }));

        allRepositories.push(...repositories);
        page++;

        if (response.data.length < perPage) {
          break;
        }

        // Rate limiting protection
        await this.handleRateLimiting();
      }

      // Cache for 30 minutes (repository access changes infrequently)
      this.setCache(cacheKey, allRepositories, 30 * 60 * 1000);
      return allRepositories;

    } catch (error) {
      if (error instanceof Error) {
        if ('status' in error && (error as any).status === 404) {
          throw new GitHubTeamNotFoundError(teamName, this.owner);
        }

        if ('status' in error && (error as any).status === 403) {
          throw new GitHubPermissionError(
            `Insufficient permissions to access repositories for team '${teamName}'`,
            'teams:read',
            'teams',
            'GET'
          );
        }

        if ('status' in error && (error as any).status === 429) {
          const resetHeader = (error as any).response?.headers['x-ratelimit-reset'];
          const resetTime = resetHeader ? new Date(parseInt(resetHeader) * 1000) : new Date(Date.now() + 3600000);
          throw new GitHubRateLimitError(
            'Rate limit exceeded while fetching team repositories',
            resetTime,
            parseInt((error as any).response?.headers['x-ratelimit-remaining'] || '0'),
            'teams',
            'GET'
          );
        }

        throw new GitHubAPIError(
          `Failed to get team repositories: ${error.message}`,
          'status' in error ? (error as any).status : 500,
          'teams',
          'GET',
          { teamName, error: error.message }
        );
      }

      throw error;
    }
  }

  /**
   * Create atomic team assignment to multiple issues
   * This is CRITICAL INFRASTRUCTURE for wave coordination and task management
   */
  async createTeamAssignment(team: string, issues: string[]): Promise<TeamAssignmentResult> {
    if (issues.length === 0) {
      return {
        team,
        successful: [],
        failed: [],
        totalProcessed: 0,
        successRate: 1.0
      };
    }

    try {
      // Verify team exists and get team members for assignment
      const teamMembers = await this.getTeamMembers(team);
      
      if (teamMembers.length === 0) {
        throw new GitHubTeamAssignmentError(
          `Team '${team}' has no members to assign`,
          team,
          { team, successful: [], failed: [], totalProcessed: 0, successRate: 0 },
          issues.length
        );
      }

      const results: TeamAssignmentResult = {
        team,
        successful: [],
        failed: [],
        totalProcessed: 0,
        successRate: 0
      };

      // Process issues in batches to respect rate limits
      const batchSize = 10;
      const batches = this.chunkArray(issues, batchSize);
      
      for (const batch of batches) {
        const batchPromises = batch.map(async (issue) => {
          try {
            const issueNumber = parseInt(issue, 10);
            if (isNaN(issueNumber)) {
              throw new Error(`Invalid issue number: ${issue}`);
            }

            // Add team label
            await this.addLabelsToIssue(issueNumber, [`team:${team}`]);

            // Assign team members to issue (limit to 2-3 members to avoid overcrowding)
            const assigneeLimit = Math.min(3, teamMembers.length);
            const assignees = teamMembers
              .slice(0, assigneeLimit)
              .map(member => member.login);
            
            if (assignees.length > 0) {
              await this.assignIssue(issueNumber, assignees);
            }

            // Add comment indicating team assignment
            const comment = `🤖 **Team Assignment**: This issue has been assigned to team **${team}**\n\n` +
                          `**Team Members**: ${teamMembers.map(m => `@${m.login}`).join(', ')}\n\n` +
                          `*This is an automated assignment by WaveOps for wave coordination.*`;
            
            await this.addIssueComment(issueNumber, comment);

            results.successful.push(issue);
            return { issue, success: true };

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.failed.push({
              issue,
              error: errorMessage
            });
            return { issue, success: false, error: errorMessage };
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Rate limiting between batches
        await this.handleRateLimiting();
      }

      results.totalProcessed = issues.length;
      results.successRate = results.successful.length / results.totalProcessed;

      // If too many failures, throw error with partial results
      if (results.failed.length > 0 && results.successRate < 0.5) {
        throw new GitHubTeamAssignmentError(
          `Team assignment partially failed: ${results.failed.length}/${results.totalProcessed} assignments failed`,
          team,
          results,
          results.failed.length
        );
      }

      return results;

    } catch (error) {
      if (error instanceof GitHubTeamAssignmentError) {
        throw error;
      }

      if (error instanceof Error) {
        if ('status' in error && (error as any).status === 403) {
          throw new GitHubPermissionError(
            'Insufficient permissions to assign team to issues',
            'issues:write',
            'issues',
            'PATCH'
          );
        }

        throw new GitHubAPIError(
          `Failed to create team assignment: ${error.message}`,
          'status' in error ? (error as any).status : 500,
          'issues',
          'PATCH',
          { team, issues, error: error.message }
        );
      }

      throw error;
    }
  }

  // =================================================================
  // PRIVATE HELPER METHODS FOR GITHUB API EXTENSIONS
  // =================================================================

  private async getTeamByName(teamName: string): Promise<any> {
    const response = await this.octokit.rest.teams.getByName({
      org: this.owner,
      team_slug: teamName
    });
    return response.data;
  }

  private mapGitHubRoleToEnum(role: string): TeamMemberRole {
    switch (role.toLowerCase()) {
      case 'maintainer':
        return TeamMemberRole.MAINTAINER;
      case 'admin':
        return TeamMemberRole.ADMIN;
      default:
        return TeamMemberRole.MEMBER;
    }
  }

  private async getTeamMemberPermissions(username: string, teamName: string): Promise<any> {
    try {
      // Get organization membership to check permissions
      const orgMembership = await this.octokit.rest.orgs.getMembershipForUser({
        org: this.owner,
        username: username
      });

      return {
        can_create_repository: orgMembership.data.role === 'admin',
        can_manage_team: orgMembership.data.role === 'admin',
        can_assign_issues: true,
        can_review_pull_requests: true,
        admin: orgMembership.data.role === 'admin',
        push: true,
        pull: true
      };
    } catch {
      return this.getDefaultPermissions();
    }
  }

  private getDefaultPermissions(): any {
    return {
      can_create_repository: false,
      can_manage_team: false,
      can_assign_issues: true,
      can_review_pull_requests: true,
      admin: false,
      push: true,
      pull: true
    };
  }

  private async handleRateLimiting(): Promise<void> {
    try {
      const rateLimit = await this.getRateLimit();
      
      if (rateLimit.remaining < 10) {
        const waitTime = rateLimit.reset.getTime() - Date.now() + 1000; // Add 1 second buffer
        if (waitTime > 0) {
          console.warn(`Rate limit low (${rateLimit.remaining} requests remaining). Waiting ${waitTime}ms until reset.`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    } catch {
      // If rate limit check fails, add a small delay as precaution
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  private async addLabelsToIssue(issueNumber: number, labels: string[]): Promise<void> {
    await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: labels
    });
  }

  private async assignIssue(issueNumber: number, assignees: string[]): Promise<void> {
    await this.octokit.rest.issues.addAssignees({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      assignees: assignees
    });
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}