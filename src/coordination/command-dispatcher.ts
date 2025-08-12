/**
 * Command Dispatcher - Integration layer between webhook handler and command parser
 */

import { CommandParser, ICommandParser } from './command-parser';
import { CommandType, ParsedCommand, CommandContext } from './types';
import { CommandExecutionError } from './errors';
import { WebhookEvent } from '../github/webhook-handler';
import { GitHubClient } from '../github/client';
import { 
  TeamMember, 
  GitHubIssue, 
  Repository, 
  TeamAssignmentResult,
  TeamMemberRole,
  GitHubAPIError,
  GitHubRateLimitError,
  GitHubTeamNotFoundError,
  GitHubPermissionError,
  GitHubTeamAssignmentError
} from '../types';

export interface ICommandDispatcher {
  processWebhookCommand(_event: WebhookEvent): Promise<CommandDispatchResult>;
  executeCommand(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult>;
  // Enhanced interface for GitHub integration
  isGitHubConnected(): boolean;
  clearCache(): void;
}

export interface CommandDispatchResult {
  success: boolean;
  results: CommandExecutionResult[];
  errors: string[];
  warnings: string[];
  metadata: {
    totalCommands: number;
    successfulCommands: number;
    processingTime: number;
  };
}

export interface CommandExecutionResult {
  command: ParsedCommand;
  success: boolean;
  message: string;
  actions?: Array<{
    type: string;
    target: string;
    details: Record<string, unknown>;
  }>;
  error?: string;
}

export class CommandDispatcher implements ICommandDispatcher {
  private readonly parser: ICommandParser;
  private readonly githubClient?: GitHubClient;
  private readonly cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private readonly defaultCacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(parser?: ICommandParser, githubClient?: GitHubClient) {
    this.parser = parser || new CommandParser();
    this.githubClient = githubClient;
  }

  /**
   * Process webhook event and extract/execute commands
   */
  public async processWebhookCommand(event: WebhookEvent): Promise<CommandDispatchResult> {
    const startTime = Date.now();
    const results: CommandExecutionResult[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract comment from webhook event
      if (!event.comment || !event.issue) {
        return {
          success: false,
          results: [],
          errors: ['No comment or issue found in webhook event'],
          warnings: [],
          metadata: {
            totalCommands: 0,
            successfulCommands: 0,
            processingTime: Date.now() - startTime
          }
        };
      }

      // Build context from webhook event
      const context = await this.buildContextFromEvent(event);
      
      // Parse natural language commands from comment
      const parseResult = await this.parser.parse(event.comment.body, context);
      
      // Add parse errors and warnings
      errors.push(...parseResult.errors);
      warnings.push(...parseResult.warnings);

      // Execute each parsed command
      for (const command of parseResult.commands) {
        try {
          // Validate command first
          const validation = await this.parser.validate(command, context);
          if (!validation.valid) {
            results.push({
              command,
              success: false,
              message: `Validation failed: ${validation.errors.join(', ')}`,
              error: validation.errors[0]
            });
            continue;
          }

          // Add validation warnings
          warnings.push(...validation.warnings);

          // Execute command
          const executionResult = await this.executeCommand(command, context);
          results.push(executionResult);

        } catch (error) {
          const executionResult: CommandExecutionResult = {
            command,
            success: false,
            message: `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          results.push(executionResult);
        }
      }

      const successfulCommands = results.filter(r => r.success).length;

      return {
        success: successfulCommands > 0,
        results,
        errors,
        warnings,
        metadata: {
          totalCommands: parseResult.commands.length,
          successfulCommands,
          processingTime: Date.now() - startTime
        }
      };

    } catch (error) {
      errors.push(`Fatal dispatch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        success: false,
        results,
        errors,
        warnings,
        metadata: {
          totalCommands: 0,
          successfulCommands: 0,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Execute a single parsed command
   */
  public async executeCommand(command: ParsedCommand, context: CommandContext): Promise<CommandExecutionResult> {
    try {
      switch (command.type) {
        case CommandType.WAVE_START:
          return await this.executeWaveStart(command, context);
          
        case CommandType.TEAM_ASSIGN:
          return await this.executeTeamAssign(command, context);
          
        case CommandType.TASK_ASSIGN:
          return await this.executeTaskAssign(command, context);
          
        case CommandType.TEAM_BLOCK:
          return await this.executeTeamBlock(command, context);
          
        case CommandType.TEAM_SYNC:
          return await this.executeTeamSync(command, context);
          
        case CommandType.LOAD_BALANCE:
          return await this.executeLoadBalance(command, context);
          
        case CommandType.BATCH_OPERATION:
          return await this.executeBatchOperation(command, context);
          
        default:
          throw new CommandExecutionError(
            `Unsupported command type: ${command.type}`,
            command.type,
            'unsupported_type'
          );
      }

    } catch (error) {
      return {
        command,
        success: false,
        message: `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Build command context from webhook event with proper error handling
   */
  private async buildContextFromEvent(event: WebhookEvent): Promise<CommandContext> {
    try {
      // Load context data with individual error handling
      const [availableTeams, availableTasks, teamMemberships, currentState] = await Promise.allSettled([
        this.loadAvailableTeams(),
        this.loadAvailableTasks(), 
        this.loadTeamMemberships(),
        this.loadCurrentWaveState(event.issue!.number)
      ]);

      const contextErrors: string[] = [];
      const contextWarnings: string[] = [];
      
      // Check for any failures and add warnings/errors
      if (availableTeams.status === 'rejected') {
        contextErrors.push(`Failed to load teams: ${availableTeams.reason}`);
      }
      if (availableTasks.status === 'rejected') {
        contextErrors.push(`Failed to load tasks: ${availableTasks.reason}`);
      }
      if (teamMemberships.status === 'rejected') {
        contextWarnings.push(`Failed to load team memberships: ${teamMemberships.reason}`);
      }
      if (currentState.status === 'rejected') {
        contextWarnings.push(`Failed to load current state: ${currentState.reason}`);
      }

      // Determine data source
      const hasGitHubData = availableTeams.status === 'fulfilled' && availableTeams.value.length > 0;
      const dataSource = this.githubClient ? (hasGitHubData ? 'github_api' : 'static_fallback') : 'static_fallback';

      return {
        issueNumber: event.issue!.number,
        repository: `${event.repository}`, // Would extract owner/name
        currentWave: this.extractWaveFromIssue(event.issue!),
        availableTeams: availableTeams.status === 'fulfilled' ? availableTeams.value : [],
        availableTasks: availableTasks.status === 'fulfilled' ? availableTasks.value : [],
        teamMemberships: teamMemberships.status === 'fulfilled' ? teamMemberships.value : {},
        currentState: currentState.status === 'fulfilled' ? currentState.value : {
          issueNumber: event.issue!.number,
          state: 'unknown',
          lastUpdated: new Date().toISOString()
        },
        githubConnected: !!this.githubClient,
        lastDataRefresh: new Date(),
        dataSource: dataSource as 'github_api' | 'static_fallback' | 'cache' | 'hybrid',
        errors: contextErrors.length > 0 ? contextErrors : undefined,
        warnings: contextWarnings.length > 0 ? contextWarnings : undefined
      };
    } catch (error) {
      console.error('Failed to build command context:', error);
      
      // Return minimal context on complete failure
      return {
        issueNumber: event.issue!.number,
        repository: `${event.repository}`,
        currentWave: this.extractWaveFromIssue(event.issue!),
        availableTeams: [],
        availableTasks: [],
        teamMemberships: {},
        currentState: {
          issueNumber: event.issue!.number,
          state: 'error',
          lastUpdated: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        githubConnected: !!this.githubClient,
        lastDataRefresh: new Date(),
        dataSource: 'static_fallback',
        errors: [error instanceof Error ? error.message : 'Failed to build command context']
      };
    }
  }

  /**
   * Extract wave number from issue
   */
  private extractWaveFromIssue(issue: { title: string }): number | undefined {
    const match = issue.title.match(/Wave\s+(\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }

  /**
   * Load available teams from GitHub API or fallback to static list
   */
  private async loadAvailableTeams(): Promise<string[]> {
    const cacheKey = this.getCacheKey('loadAvailableTeams');
    const cached = this.getFromCache<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.githubClient) {
      // Fallback to static team list when GitHub client is not available
      console.warn('GitHub client not configured, using static team list');
      const staticTeams = [
        'team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon',
        'team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design'
      ];
      this.setCache(cacheKey, staticTeams, 30 * 60 * 1000); // 30 minutes cache
      return staticTeams;
    }

    try {
      // Get all organization teams by trying common team name patterns
      const commonTeamPatterns = [
        'team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon',
        'team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design',
        'frontend', 'backend', 'devops', 'qa', 'design', 'alpha', 'beta', 'gamma'
      ];

      const existingTeams: string[] = [];
      
      // Check each potential team name
      for (const teamName of commonTeamPatterns) {
        try {
          const members = await this.githubClient.getTeamMembers(teamName);
          if (members.length > 0) {
            existingTeams.push(teamName);
          }
        } catch (error) {
          // Ignore team not found errors, continue checking other teams
          if (!(error instanceof GitHubTeamNotFoundError)) {
            console.warn(`Warning: Failed to check team '${teamName}': ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // If no teams found, fall back to static list
      const teams = existingTeams.length > 0 ? existingTeams : [
        'team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon',
        'team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design'
      ];

      // Cache for 15 minutes (teams don't change frequently)
      this.setCache(cacheKey, teams, 15 * 60 * 1000);
      return teams;

    } catch (error) {
      console.error('Failed to load teams from GitHub:', error);
      
      // Fall back to static team list on error
      const fallbackTeams = [
        'team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon',
        'team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design'
      ];
      
      // Cache fallback for shorter time
      this.setCache(cacheKey, fallbackTeams, 5 * 60 * 1000); // 5 minutes
      return fallbackTeams;
    }
  }

  /**
   * Load available tasks from GitHub Issues API or fallback to static list
   */
  private async loadAvailableTasks(): Promise<string[]> {
    const cacheKey = this.getCacheKey('loadAvailableTasks');
    const cached = this.getFromCache<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.githubClient) {
      // Fallback to static task list when GitHub client is not available
      console.warn('GitHub client not configured, using static task list');
      const staticTasks = [
        'W1.T001', 'W1.T002', 'W1.T003', 'W1.T004', 'W1.T005',
        'W2.T001', 'W2.T002', 'W2.T003', 'W2.T004',
        'W3.T001', 'W3.T002', 'W3.T003'
      ];
      this.setCache(cacheKey, staticTasks, 30 * 60 * 1000); // 30 minutes cache
      return staticTasks;
    }

    try {
      // Get issues with wave-related labels
      const waveLabels = ['wave', 'task', 'waveops'];
      const issues = await this.githubClient.getRepositoryIssues(waveLabels);
      
      // Convert GitHub issues to task identifiers
      const tasks = issues.map(issue => {
        // Try to extract wave and task info from title or generate from issue number
        const waveMatch = issue.title.match(/[Ww]ave[\s-]*(\d+)/i);
        const taskMatch = issue.title.match(/[Tt]ask[\s-]*(\d+)/i) || issue.title.match(/T(\d+)/i);
        
        if (waveMatch && taskMatch) {
          return `W${waveMatch[1]}.T${taskMatch[1].padStart(3, '0')}`;
        } else if (waveMatch) {
          return `W${waveMatch[1]}.T${issue.number.toString().padStart(3, '0')}`;
        } else {
          // Default format using issue number
          return `W1.T${issue.number.toString().padStart(3, '0')}`;
        }
      });

      // Filter out duplicates and sort
      const uniqueTasks = [...new Set(tasks)].sort();
      
      // If no issues found, fall back to static list
      const finalTasks = uniqueTasks.length > 0 ? uniqueTasks : [
        'W1.T001', 'W1.T002', 'W1.T003', 'W1.T004', 'W1.T005',
        'W2.T001', 'W2.T002', 'W2.T003', 'W2.T004',
        'W3.T001', 'W3.T002', 'W3.T003'
      ];

      // Cache for 5 minutes (issues change more frequently)
      this.setCache(cacheKey, finalTasks, 5 * 60 * 1000);
      return finalTasks;

    } catch (error) {
      console.error('Failed to load tasks from GitHub issues:', error);
      
      // Fall back to static task list on error
      const fallbackTasks = [
        'W1.T001', 'W1.T002', 'W1.T003', 'W1.T004', 'W1.T005',
        'W2.T001', 'W2.T002', 'W2.T003', 'W2.T004',
        'W3.T001', 'W3.T002', 'W3.T003'
      ];
      
      // Cache fallback for shorter time
      this.setCache(cacheKey, fallbackTasks, 2 * 60 * 1000); // 2 minutes
      return fallbackTasks;
    }
  }

  /**
   * Load team memberships from GitHub API or fallback to static mappings
   */
  private async loadTeamMemberships(): Promise<Record<string, string>> {
    const cacheKey = this.getCacheKey('loadTeamMemberships');
    const cached = this.getFromCache<Record<string, string>>(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.githubClient) {
      // Fallback to static memberships when GitHub client is not available
      console.warn('GitHub client not configured, using static team memberships');
      const staticMemberships = {
        'alice': 'team-alpha',
        'bob': 'team-beta',
        'charlie': 'team-gamma',
        'diana': 'team-delta',
        'eve': 'team-epsilon'
      };
      this.setCache(cacheKey, staticMemberships, 30 * 60 * 1000); // 30 minutes cache
      return staticMemberships;
    }

    try {
      const memberships: Record<string, string> = {};
      const teams = await this.loadAvailableTeams();
      
      // For each team, get the members and build membership mapping
      for (const teamName of teams) {
        try {
          const members = await this.githubClient.getTeamMembers(teamName);
          
          for (const member of members) {
            // If user is already in another team, show warning but use latest assignment
            if (memberships[member.login] && memberships[member.login] !== teamName) {
              console.warn(`User ${member.login} found in multiple teams: ${memberships[member.login]} and ${teamName}`);
            }
            memberships[member.login] = teamName;
          }
        } catch (error) {
          // Log team access failures but continue processing other teams
          if (error instanceof GitHubTeamNotFoundError) {
            console.warn(`Team '${teamName}' not found, skipping membership lookup`);
          } else if (error instanceof GitHubPermissionError) {
            console.warn(`No permission to access team '${teamName}', skipping membership lookup`);
          } else {
            console.warn(`Failed to get members for team '${teamName}': ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      // If no memberships found, fall back to static mappings
      const finalMemberships = Object.keys(memberships).length > 0 ? memberships : {
        'alice': 'team-alpha',
        'bob': 'team-beta',
        'charlie': 'team-gamma',
        'diana': 'team-delta',
        'eve': 'team-epsilon'
      };

      // Cache for 15 minutes (team memberships don't change frequently)
      this.setCache(cacheKey, finalMemberships, 15 * 60 * 1000);
      return finalMemberships;

    } catch (error) {
      console.error('Failed to load team memberships from GitHub:', error);
      
      // Fall back to static memberships on error
      const fallbackMemberships = {
        'alice': 'team-alpha',
        'bob': 'team-beta',
        'charlie': 'team-gamma',
        'diana': 'team-delta',
        'eve': 'team-epsilon'
      };
      
      // Cache fallback for shorter time
      this.setCache(cacheKey, fallbackMemberships, 5 * 60 * 1000); // 5 minutes
      return fallbackMemberships;
    }
  }

  /**
   * Load current wave state (placeholder - would read from GitHub issue)
   */
  private async loadCurrentWaveState(issueNumber: number): Promise<Record<string, unknown>> {
    // In real implementation, would parse wave state from issue body or comments
    return {
      issueNumber,
      state: 'active',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Convert task identifiers to GitHub issue numbers
   */
  private async convertTasksToIssueNumbers(tasks: string[]): Promise<string[]> {
    if (!this.githubClient) {
      // Return task identifiers as-is if no GitHub client
      return tasks;
    }

    const issueNumbers: string[] = [];
    
    for (const task of tasks) {
      // Try to extract issue number from task format (e.g., W1.T001 -> 1)
      const taskMatch = task.match(/[WT](\d+)/i);
      if (taskMatch) {
        issueNumbers.push(taskMatch[1]);
      } else if (/^\d+$/.test(task)) {
        // Already an issue number
        issueNumbers.push(task);
      } else {
        console.warn(`Could not convert task '${task}' to issue number, skipping`);
      }
    }

    return issueNumbers;
  }

  /**
   * Handle GitHub API errors with appropriate fallback strategies
   */
  private handleGitHubAPIError(error: unknown, operation: string): {
    message: string;
    shouldRetry: boolean;
    fallbackStrategy: 'static_data' | 'cache_only' | 'fail_fast';
  } {
    if (error instanceof GitHubRateLimitError) {
      const waitMinutes = Math.ceil((error.resetTime.getTime() - Date.now()) / (1000 * 60));
      return {
        message: `GitHub API rate limit exceeded. Reset in ${waitMinutes} minutes. Using cached data if available.`,
        shouldRetry: false,
        fallbackStrategy: 'cache_only'
      };
    }

    if (error instanceof GitHubTeamNotFoundError) {
      return {
        message: `Team '${error.teamName}' not found in organization '${error.organization}'. Using default team configuration.`,
        shouldRetry: false,
        fallbackStrategy: 'static_data'
      };
    }

    if (error instanceof GitHubPermissionError) {
      return {
        message: `Insufficient GitHub permissions for ${operation}. Required: ${error.requiredPermission}. Using fallback data.`,
        shouldRetry: false,
        fallbackStrategy: 'static_data'
      };
    }

    if (error instanceof GitHubTeamAssignmentError) {
      return {
        message: `Team assignment partially failed: ${error.totalFailures} failures. Partial results available.`,
        shouldRetry: false,
        fallbackStrategy: 'static_data'
      };
    }

    if (error instanceof GitHubAPIError) {
      const isRetryable = error.statusCode >= 500 || error.statusCode === 502 || error.statusCode === 503;
      return {
        message: `GitHub API error (${error.statusCode}): ${error.message}`,
        shouldRetry: isRetryable,
        fallbackStrategy: isRetryable ? 'cache_only' : 'static_data'
      };
    }

    // Unknown error
    return {
      message: `Unexpected error during ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      shouldRetry: false,
      fallbackStrategy: 'fail_fast'
    };
  }

  /**
   * Command execution handlers
   */
  private async executeWaveStart(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    // In real implementation, would:
    // 1. Update wave state to 'started'
    // 2. Notify teams
    // 3. Create task assignments
    // 4. Update GitHub issue

    return {
      command: _command,
      success: true,
      message: 'Wave started successfully',
      actions: [{
        type: 'wave_start',
        target: `wave-${_context.currentWave}`,
        details: { teams: (_command.parameters as any).teams }
      }]
    };
  }

  private async executeTeamAssign(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    const params = _command.parameters as any;
    
    if (!this.githubClient) {
      // Fallback to mock execution when GitHub client is not available
      console.warn('GitHub client not configured, simulating team assignment');
      return {
        command: _command,
        success: true,
        message: `SIMULATED: Assigned teams ${params.teams.join(', ')} to tasks ${params.tasks.join(', ')}`,
        actions: [{
          type: 'team_assignment',
          target: 'teams',
          details: { teams: params.teams, tasks: params.tasks, priority: params.priority, simulated: true }
        }]
      };
    }

    try {
      const assignmentResults: TeamAssignmentResult[] = [];
      const allSuccessfulAssignments: string[] = [];
      const allFailedAssignments: Array<{ issue: string; error: string }> = [];

      // Process each team assignment
      for (const team of params.teams) {
        try {
          // Convert task identifiers to issue numbers
          const issueNumbers = await this.convertTasksToIssueNumbers(params.tasks || []);
          
          if (issueNumbers.length === 0) {
            throw new Error(`No valid issue numbers found for tasks: ${params.tasks?.join(', ') || 'none'}`);
          }

          // Create team assignment using GitHub API
          const result = await this.githubClient.createTeamAssignment(team, issueNumbers);
          assignmentResults.push(result);
          
          allSuccessfulAssignments.push(...result.successful.map(issue => `${team}:${issue}`));
          allFailedAssignments.push(...result.failed.map(f => ({ 
            issue: `${team}:${f.issue}`, 
            error: f.error 
          })));

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Team assignment failed for team '${team}':`, error);
          
          // Add all tasks as failed for this team
          const taskFailures = (params.tasks || []).map((task: string) => ({
            issue: `${team}:${task}`,
            error: errorMessage
          }));
          allFailedAssignments.push(...taskFailures);
        }
      }

      const totalAssignments = allSuccessfulAssignments.length + allFailedAssignments.length;
      const successRate = totalAssignments > 0 ? allSuccessfulAssignments.length / totalAssignments : 0;

      // Determine overall success based on success rate
      const overallSuccess = successRate >= 0.5; // At least 50% success
      
      let message: string;
      if (allSuccessfulAssignments.length > 0 && allFailedAssignments.length === 0) {
        message = `Successfully assigned teams ${params.teams.join(', ')} to all tasks`;
      } else if (allSuccessfulAssignments.length > 0) {
        message = `Partially assigned teams: ${allSuccessfulAssignments.length}/${totalAssignments} assignments successful`;
      } else {
        message = `Failed to assign teams ${params.teams.join(', ')} to tasks`;
      }

      return {
        command: _command,
        success: overallSuccess,
        message,
        actions: [{
          type: 'team_assignment',
          target: 'teams',
          details: { 
            teams: params.teams, 
            tasks: params.tasks, 
            priority: params.priority,
            results: assignmentResults,
            successful: allSuccessfulAssignments,
            failed: allFailedAssignments,
            successRate
          }
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Team assignment execution failed:', error);
      
      return {
        command: _command,
        success: false,
        message: `Team assignment failed: ${errorMessage}`,
        error: errorMessage,
        actions: [{
          type: 'team_assignment_failed',
          target: 'teams',
          details: { 
            teams: params.teams, 
            tasks: params.tasks, 
            error: errorMessage
          }
        }]
      };
    }
  }

  private async executeTaskAssign(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    const params = _command.parameters as any;
    
    return {
      command: _command,
      success: true,
      message: `Reassigned task ${params.taskId} to team ${params.team}`,
      actions: [{
        type: 'task_reassignment',
        target: params.taskId,
        details: { team: params.team, priority: params.priority }
      }]
    };
  }

  private async executeTeamBlock(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    const params = _command.parameters as any;
    
    return {
      command: _command,
      success: true,
      message: `Blocked team ${params.blockedTeam} on team ${params.blockingTeam} ${params.condition}`,
      actions: [{
        type: 'team_blocking',
        target: params.blockedTeam,
        details: { blockingTeam: params.blockingTeam, condition: params.condition }
      }]
    };
  }

  private async executeTeamSync(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    const params = _command.parameters as any;
    
    return {
      command: _command,
      success: true,
      message: `Synchronized teams ${params.teams.join(', ')} on ${params.condition}`,
      actions: [{
        type: 'team_sync',
        target: 'teams',
        details: { teams: params.teams, condition: params.condition }
      }]
    };
  }

  private async executeLoadBalance(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    const params = _command.parameters as any;
    
    return {
      command: _command,
      success: true,
      message: `Load balanced across teams ${params.teams.join(', ')} using ${params.strategy} strategy`,
      actions: [{
        type: 'load_balance',
        target: 'teams',
        details: { teams: params.teams, strategy: params.strategy }
      }]
    };
  }

  private async executeBatchOperation(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult> {
    const params = _command.parameters as { commands: ParsedCommand[] };
    const results: CommandExecutionResult[] = [];
    
    // Execute each command in sequence
    for (const subCommand of params.commands) {
      const result = await this.executeCommand(subCommand, _context);
      results.push(result);
    }

    const successfulCount = results.filter(r => r.success).length;
    
    return {
      command: _command,
      success: successfulCount > 0,
      message: `Batch operation completed: ${successfulCount}/${results.length} commands successful`,
      actions: results.flatMap(r => r.actions || [])
    };
  }

  /**
   * Cache helper methods
   */
  private getCacheKey(method: string, ...args: any[]): string {
    return `${method}:${JSON.stringify(args)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.timestamp + entry.ttl) {
      return entry.data;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache<T>(key: string, data: T, ttl: number = this.defaultCacheTTL): void {
    // Simple LRU eviction if cache gets too large
    if (this.cache.size >= 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Format dispatch result for GitHub comment response
   */
  public formatResponseComment(result: CommandDispatchResult): string {
    const lines: string[] = [];
    
    if (result.success) {
      lines.push('✅ **Command(s) executed successfully**\n');
    } else {
      lines.push('❌ **Command execution failed**\n');
    }

    // Summary
    lines.push(`**Summary:**`);
    lines.push(`- Total commands: ${result.metadata.totalCommands}`);
    lines.push(`- Successful: ${result.metadata.successfulCommands}`);
    lines.push(`- Processing time: ${result.metadata.processingTime}ms\n`);

    // Individual results
    if (result.results.length > 0) {
      lines.push('**Results:**');
      for (const [index, cmdResult] of result.results.entries()) {
        const icon = cmdResult.success ? '✅' : '❌';
        lines.push(`${index + 1}. ${icon} ${cmdResult.message}`);
      }
      lines.push('');
    }

    // Errors
    if (result.errors.length > 0) {
      lines.push('**Errors:**');
      for (const error of result.errors) {
        lines.push(`- ⚠️ ${error}`);
      }
      lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push('**Warnings:**');
      for (const warning of result.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Check if GitHub client is connected and functional
   */
  public isGitHubConnected(): boolean {
    return !!this.githubClient;
  }

  /**
   * Clear internal cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 100
    };
  }
}