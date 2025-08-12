/**
 * Command Dispatcher - Integration layer between webhook handler and command parser
 */

import { CommandParser, ICommandParser } from './command-parser';
import { CommandType, ParsedCommand, CommandContext } from './types';
import { CommandExecutionError } from './errors';
import { WebhookEvent } from '../github/webhook-handler';

export interface ICommandDispatcher {
  processWebhookCommand(_event: WebhookEvent): Promise<CommandDispatchResult>;
  executeCommand(_command: ParsedCommand, _context: CommandContext): Promise<CommandExecutionResult>;
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

  constructor(parser?: ICommandParser) {
    this.parser = parser || new CommandParser();
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
   * Build command context from webhook event
   */
  private async buildContextFromEvent(event: WebhookEvent): Promise<CommandContext> {
    // In a real implementation, this would fetch data from GitHub API and configuration
    // For now, we'll build a basic context from the event
    
    return {
      issueNumber: event.issue!.number,
      repository: `${event.repository}`, // Would extract owner/name
      currentWave: this.extractWaveFromIssue(event.issue!),
      availableTeams: await this.loadAvailableTeams(),
      availableTasks: await this.loadAvailableTasks(),
      teamMemberships: await this.loadTeamMemberships(),
      currentState: await this.loadCurrentWaveState(event.issue!.number)
    };
  }

  /**
   * Extract wave number from issue
   */
  private extractWaveFromIssue(issue: { title: string }): number | undefined {
    const match = issue.title.match(/Wave\s+(\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }

  /**
   * Load available teams (placeholder - would read from config)
   */
  private async loadAvailableTeams(): Promise<string[]> {
    // In real implementation, would load from teams.yaml or GitHub API
    return [
      'team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon',
      'team-frontend', 'team-backend', 'team-devops', 'team-qa', 'team-design'
    ];
  }

  /**
   * Load available tasks (placeholder - would read from wave definition)
   */
  private async loadAvailableTasks(): Promise<string[]> {
    // In real implementation, would load from tasks.yaml or wave definition
    return [
      'W1.T001', 'W1.T002', 'W1.T003', 'W1.T004', 'W1.T005',
      'W2.T001', 'W2.T002', 'W2.T003', 'W2.T004',
      'W3.T001', 'W3.T002', 'W3.T003'
    ];
  }

  /**
   * Load team memberships (placeholder - would read from GitHub teams)
   */
  private async loadTeamMemberships(): Promise<Record<string, string>> {
    // In real implementation, would load from GitHub teams API
    return {
      'alice': 'team-alpha',
      'bob': 'team-beta',
      'charlie': 'team-gamma',
      'diana': 'team-delta',
      'eve': 'team-epsilon'
    };
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
    
    return {
      command: _command,
      success: true,
      message: `Assigned teams ${params.teams.join(', ')} to tasks ${params.tasks.join(', ')}`,
      actions: [{
        type: 'team_assignment',
        target: 'teams',
        details: { teams: params.teams, tasks: params.tasks, priority: params.priority }
      }]
    };
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
}