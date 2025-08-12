/**
 * Sophisticated Natural Language Command Parser for WaveOps
 * Parses complex coordination commands from GitHub issue comments
 */

import {
  CommandType,
  Priority,
  ParsedCommand,
  CommandParameters,
  TeamAssignment,
  TaskAssignment,
  BlockingRelation,
  SyncOperation,
  LoadBalanceOperation,
  CommandContext,
  ValidationResult,
  ParserConfig,
  ParseResult
} from './types';
import { CommandParseError, ParseErrorCode } from './errors';

export interface ICommandParser {
  parse(_input: string, _context: CommandContext): Promise<ParseResult>;
  validate(_command: ParsedCommand, _context: CommandContext): Promise<ValidationResult>;
}

export class CommandParser implements ICommandParser {
  private readonly config: ParserConfig;
  private readonly commandPatterns: Map<CommandType, RegExp[]>;
  private readonly vocabularyMap: Map<string, string[]>;

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = {
      enableFuzzyMatching: true,
      confidenceThreshold: 0.7,
      maxAlternatives: 3,
      allowAmbiguousCommands: false,
      vocabularyExtensions: {},
      ...config
    };

    this.commandPatterns = new Map();
    this.vocabularyMap = new Map();
    this.initializePatterns();
    this.initializeVocabulary();
  }

  /**
   * Parse natural language command input
   */
  public async parse(input: string, context: CommandContext): Promise<ParseResult> {
    const startTime = Date.now();
    const commands: ParsedCommand[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Preprocess input
      const cleanInput = this.preprocessInput(input);
      
      // Handle empty input
      if (!cleanInput || cleanInput.trim().length === 0) {
        errors.push('Empty command input');
        return {
          commands: [],
          errors,
          warnings,
          metadata: {
            parseTime: Date.now() - startTime,
            confidence: 0,
            ambiguityScore: 0
          }
        };
      }
      
      // Handle batch operations (multiple commands separated by semicolon or "and then")
      const commandSegments = this.segmentCommands(cleanInput);
      
      let totalConfidence = 0;
      let ambiguityScore = 0;

      for (const segment of commandSegments) {
        try {
          const parsedCommand = await this.parseSegment(segment.trim(), context);
          commands.push(parsedCommand);
          totalConfidence += parsedCommand.confidence;
          
          // Check for ambiguity
          if (parsedCommand.alternatives && parsedCommand.alternatives.length > 0) {
            ambiguityScore += parsedCommand.alternatives.length;
          }
        } catch (error) {
          if (error instanceof CommandParseError) {
            errors.push(`${error.message} (Position: ${error.position})`);
            if (error.suggestions) {
              warnings.push(`Suggestions: ${error.suggestions.join(', ')}`);
            }
          } else {
            errors.push(`Unexpected error parsing segment: ${segment}`);
          }
        }
      }

      // Handle batch operation wrapper
      if (commands.length > 1) {
        const batchCommand: ParsedCommand = {
          type: CommandType.BATCH_OPERATION,
          raw: input,
          actor: context.teamMemberships[Object.keys(context.teamMemberships)[0]] || 'unknown',
          timestamp: new Date(),
          parameters: { commands },
          confidence: totalConfidence / commands.length,
          alternatives: []
        };
        
        return {
          commands: [batchCommand],
          errors,
          warnings,
          metadata: {
            parseTime: Date.now() - startTime,
            confidence: totalConfidence / commands.length,
            ambiguityScore: ambiguityScore / Math.max(commands.length, 1)
          }
        };
      }

      return {
        commands,
        errors,
        warnings,
        metadata: {
          parseTime: Date.now() - startTime,
          confidence: commands.length > 0 ? totalConfidence / commands.length : 0,
          ambiguityScore: ambiguityScore / Math.max(commands.length, 1)
        }
      };

    } catch (error) {
      errors.push(`Fatal parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        commands: [],
        errors,
        warnings,
        metadata: {
          parseTime: Date.now() - startTime,
          confidence: 0,
          ambiguityScore: 1
        }
      };
    }
  }

  /**
   * Validate a parsed command against context
   */
  public async validate(command: ParsedCommand, context: CommandContext): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Validate command type
      if (!Object.values(CommandType).includes(command.type)) {
        errors.push(`Unknown command type: ${command.type}`);
      }

      // Validate parameters based on command type
      switch (command.type) {
        case CommandType.TEAM_ASSIGN:
          this.validateTeamAssignment(command.parameters as TeamAssignment, context, errors, warnings, suggestions);
          break;
          
        case CommandType.TASK_ASSIGN:
          this.validateTaskAssignment(command.parameters as TaskAssignment, context, errors, warnings, suggestions);
          break;
          
        case CommandType.TEAM_BLOCK:
          this.validateBlockingRelation(command.parameters as BlockingRelation, context, errors, warnings, suggestions);
          break;
          
        case CommandType.TEAM_SYNC:
          this.validateSyncOperation(command.parameters as SyncOperation, context, errors, warnings, suggestions);
          break;
          
        case CommandType.LOAD_BALANCE:
          this.validateLoadBalance(command.parameters as LoadBalanceOperation, context, errors, warnings, suggestions);
          break;
      }

      // Check confidence threshold
      if (command.confidence < this.config.confidenceThreshold) {
        warnings.push(`Low confidence command (${command.confidence.toFixed(2)}). Consider rephrasing.`);
      }

    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Initialize command patterns for matching
   */
  private initializePatterns(): void {
    this.commandPatterns.set(CommandType.WAVE_START, [
      /^start\s+wave\s+(\w+)(?:\s+with\s+teams?\s+([\w\s,\\-]+))?/i,
      /^launch\s+wave\s+(\w+)(?:\s+(?:using|with)\s+teams?\s+([\w\s,\\-]+))?/i,
      /^begin\s+wave\s+(\w+)(?:\s+teams?\s+([\w\s,\\-]+))?/i
    ]);

    this.commandPatterns.set(CommandType.TEAM_ASSIGN, [
      /^assign\s+teams?\s+([\w\s,\-]+)\s+to\s+tasks?\s+([\w\s,\-#\.]+)(?:\s+with\s+(\w+)\s+priority)?/i,
      /^give\s+teams?\s+([\w\s,\-]+)\s+tasks?\s+([\w\s,\-#\.]+)(?:\s+priority\s+(\w+))?/i,
      /^allocate\s+tasks?\s+([\w\s,\-#\.]+)\s+to\s+teams?\s+([\w\s,\-]+)(?:\s+(\w+)\s+priority)?/i,
      /^delegate\s+tasks?\s+([\w\s,\-#\.]+)\s+to\s+teams?\s+([\w\s,\-]+)(?:\s+(\w+)\s+priority)?/i
    ]);

    this.commandPatterns.set(CommandType.TEAM_BLOCK, [
      /^block\s+teams?\s+([\w\s,\-]+)\s+on\s+teams?\s+([\w\s,\-]+)(?:\s+(\w+))?/i,
      /^teams?\s+([\w\s,\-]+)\s+(?:waits?\s+for|depends?\s+on|blocks?\s+on)\s+teams?\s+([\w\s,\-]+)(?:\s+(\w+))?/i,
      /^make\s+teams?\s+([\w\s,\-]+)\s+wait\s+for\s+teams?\s+([\w\s,\-]+)(?:\s+until\s+(.+))?/i
    ]);

    this.commandPatterns.set(CommandType.TASK_ASSIGN, [
      /^reassign\s+tasks?\s+(#?[\w\.]+)\s+to\s+teams?\s+([\w\s,\-]+)(?:\s+with\s+(\w+)\s+priority)?/i,
      /^move\s+tasks?\s+(#?[\w\.]+)\s+to\s+teams?\s+([\w\s,\-]+)(?:\s+priority\s+(\w+))?/i,
      /^transfer\s+tasks?\s+(#?[\w\.]+)\s+to\s+teams?\s+([\w\s,\-]+)(?:\s+with\s+(\w+)\s+priority)?/i
    ]);

    this.commandPatterns.set(CommandType.TEAM_SYNC, [
      /^sync\s+teams?\s+([\w\s,\\-]+)\s+on\s+(.+)/i,
      /^synchronize\s+teams?\s+([\w\s,\\-]+)\s+(?:when|on|after)\s+(.+)/i,
      /^coordinate\s+teams?\s+([\w\s,\\-]+)\s+for\s+(.+)/i
    ]);

    this.commandPatterns.set(CommandType.LOAD_BALANCE, [
      /^(?:auto\-?)?balance\s+(?:load\s+)?(?:across\s+)?teams?\s+([\w\s,\\-]+)(?:\s+using\s+(\w+))?/i,
      /^distribute\s+(?:work\s+)?(?:across\s+)?teams?\s+([\w\s,\\-]+)(?:\s+(\w+)\s+strategy)?/i,
      /^rebalance\s+teams?\s+([\w\s,\\-]+)/i
    ]);
  }

  /**
   * Initialize vocabulary mappings for fuzzy matching
   */
  private initializeVocabulary(): void {
    this.vocabularyMap.set('start', ['launch', 'begin', 'initiate', 'kick off', 'commence']);
    this.vocabularyMap.set('assign', ['allocate', 'give', 'delegate', 'distribute']);
    this.vocabularyMap.set('block', ['wait', 'depend', 'hold', 'pause']);
    this.vocabularyMap.set('sync', ['synchronize', 'coordinate', 'align']);
    this.vocabularyMap.set('balance', ['distribute', 'rebalance', 'level']);
    this.vocabularyMap.set('team', ['teams', 'group', 'groups', 'squad', 'squads']);
    this.vocabularyMap.set('task', ['tasks', 'work', 'item', 'items', 'ticket', 'tickets']);
    
    // Add vocabulary extensions from config
    for (const [key, extensions] of Object.entries(this.config.vocabularyExtensions)) {
      const existing = this.vocabularyMap.get(key) || [];
      this.vocabularyMap.set(key, [...existing, ...extensions]);
    }
  }

  /**
   * Preprocess input text for better parsing
   */
  private preprocessInput(input: string): string {
    return input
      .trim()
      .replace(/[""'']/g, '"')  // Normalize quotes
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .replace(/\btask#/gi, 'task #')  // Normalize task references
      .replace(/\bteam-/gi, 'team ')   // Normalize team references
      .toLowerCase();
  }

  /**
   * Segment commands for batch operations
   */
  private segmentCommands(input: string): string[] {
    // Split on common separators
    const segments = input.split(/[;]|(?:\s+and\s+then\s+)|(?:\s+then\s+)|(?:\s+also\s+)/i);
    return segments.filter(s => s.trim().length > 0);
  }

  /**
   * Parse a single command segment
   */
  private async parseSegment(segment: string, context: CommandContext): Promise<ParsedCommand> {
    const alternatives: ParsedCommand[] = [];
    let bestMatch: ParsedCommand | null = null;
    let highestConfidence = 0;

    // Try each command type
    for (const [commandType, patterns] of this.commandPatterns.entries()) {
      for (const pattern of patterns) {
        const match = segment.match(pattern);
        if (match) {
          try {
            const command = this.buildCommand(commandType, match, segment, context);
            
            if (command.confidence > highestConfidence) {
              if (bestMatch && bestMatch.confidence > this.config.confidenceThreshold) {
                alternatives.push(bestMatch);
              }
              bestMatch = command;
              highestConfidence = command.confidence;
            } else if (command.confidence > this.config.confidenceThreshold) {
              alternatives.push(command);
            }
          } catch (error) {
            // Continue trying other patterns
          }
        }
      }
    }

    if (!bestMatch) {
      throw new CommandParseError(
        `Unable to parse command: "${segment}"`,
        ParseErrorCode.UNKNOWN_COMMAND,
        {
          suggestions: this.generateSuggestions(segment),
          context: { segment, availableCommands: Array.from(this.commandPatterns.keys()) }
        }
      );
    }

    // Add alternatives if enabled
    if (this.config.maxAlternatives > 0) {
      bestMatch.alternatives = alternatives.slice(0, this.config.maxAlternatives);
    }

    return bestMatch;
  }

  /**
   * Build command object from regex match
   */
  private buildCommand(
    type: CommandType,
    match: RegExpMatchArray,
    raw: string,
    context: CommandContext
  ): ParsedCommand {
    const timestamp = new Date();
    const actor = Object.keys(context.teamMemberships)[0] || 'unknown';
    
    let parameters: CommandParameters;
    let confidence = 0.8; // Base confidence

    switch (type) {
      case CommandType.WAVE_START:
        parameters = this.parseWaveStart(match, context);
        confidence = 0.9;
        break;
        
      case CommandType.TEAM_ASSIGN:
        parameters = this.parseTeamAssign(match, context);
        confidence = 0.85;
        break;
        
      case CommandType.TEAM_BLOCK:
        parameters = this.parseTeamBlock(match, context);
        confidence = 0.8;
        break;
        
      case CommandType.TASK_ASSIGN:
        parameters = this.parseTaskAssign(match, context);
        confidence = 0.85;
        break;
        
      case CommandType.TEAM_SYNC:
        parameters = this.parseTeamSync(match, context);
        confidence = 0.75;
        break;
        
      case CommandType.LOAD_BALANCE:
        parameters = this.parseLoadBalance(match, context);
        confidence = 0.8;
        break;
        
      default:
        throw new CommandParseError(
          `Unsupported command type: ${type}`,
          ParseErrorCode.UNKNOWN_COMMAND
        );
    }

    return {
      type,
      raw,
      actor,
      timestamp,
      parameters,
      confidence,
      alternatives: []
    };
  }

  /**
   * Parse wave start command
   */
  private parseWaveStart(match: RegExpMatchArray, context: CommandContext): TeamAssignment {
    const waveName = match[1];
    const teamsStr = match[2];
    
    const teams = teamsStr ? this.parseTeamList(teamsStr, context) : context.availableTeams;
    
    return {
      teams,
      tasks: [], // Will be populated based on wave definition
      priority: Priority.NORMAL
    };
  }

  /**
   * Parse team assignment command
   */
  private parseTeamAssign(match: RegExpMatchArray, context: CommandContext): TeamAssignment {
    const teamsStr = match[1];
    const tasksStr = match[2];
    const priorityStr = match[3];
    
    const teams = this.parseTeamList(teamsStr, context);
    const tasks = this.parseTaskList(tasksStr, context);
    const priority = this.parsePriority(priorityStr);
    
    return {
      teams,
      tasks,
      priority
    };
  }

  /**
   * Parse team blocking command
   */
  private parseTeamBlock(match: RegExpMatchArray, context: CommandContext): BlockingRelation {
    const blockedTeamsStr = match[1];
    const blockingTeamsStr = match[2];
    const conditionStr = match[3];
    
    const blockedTeams = this.parseTeamList(blockedTeamsStr, context);
    const blockingTeams = this.parseTeamList(blockingTeamsStr, context);
    
    // For simplicity, use first team from each list
    return {
      blockedTeam: blockedTeams[0],
      blockingTeam: blockingTeams[0],
      condition: conditionStr || 'completion',
      until: conditionStr
    };
  }

  /**
   * Parse task assignment command
   */
  private parseTaskAssign(match: RegExpMatchArray, context: CommandContext): TaskAssignment {
    const taskId = match[1].replace('#', '');
    const teamStr = match[2];
    const priorityStr = match[3];
    
    const teams = this.parseTeamList(teamStr, context);
    const priority = this.parsePriority(priorityStr);
    
    return {
      taskId,
      team: teams[0],
      priority
    };
  }

  /**
   * Parse team sync command
   */
  private parseTeamSync(match: RegExpMatchArray, context: CommandContext): SyncOperation {
    const teamsStr = match[1];
    const condition = match[2];
    
    const teams = this.parseTeamList(teamsStr, context);
    
    return {
      teams,
      condition,
      trigger: condition.includes('completion') ? 'completion' : 'custom'
    };
  }

  /**
   * Parse load balance command
   */
  private parseLoadBalance(match: RegExpMatchArray, context: CommandContext): LoadBalanceOperation {
    const teamsStr = match[1];
    const strategyStr = match[2];
    
    const teams = this.parseTeamList(teamsStr, context);
    const strategy = this.parseBalanceStrategy(strategyStr);
    
    return {
      teams,
      strategy,
      constraints: {}
    };
  }

  /**
   * Parse team list from string
   */
  private parseTeamList(teamsStr: string, context: CommandContext): string[] {
    if (!teamsStr) {return [];}
    
    const teams = teamsStr.split(/[,\s]+/)
      .map(t => t.trim().replace(/^team-?/i, ''))
      .filter(t => t.length > 0);
    
    // Handle ranges like "teams 1-5"
    const expandedTeams: string[] = [];
    for (const team of teams) {
      const rangeMatch = team.match(/^(\w+)-(\w+)$/) || team.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const [, start, end] = rangeMatch;
        if (/^\d+$/.test(start) && /^\d+$/.test(end)) {
          const startNum = parseInt(start);
          const endNum = parseInt(end);
          for (let i = startNum; i <= endNum; i++) {
            expandedTeams.push(`team-${i}`);
          }
        } else {
          expandedTeams.push(team);
        }
      } else {
        expandedTeams.push(team.startsWith('team') ? team : `team-${team}`);
      }
    }
    
    return expandedTeams;
  }

  /**
   * Parse task list from string
   */
  private parseTaskList(tasksStr: string, context: CommandContext): string[] {
    if (!tasksStr) {return [];}
    
    const tasks = tasksStr.split(/[,\s]+/)
      .map(t => t.trim().replace('#', ''))
      .filter(t => t.length > 0);

    // Handle ranges like "tasks 1-5"
    const expandedTasks: string[] = [];
    for (const task of tasks) {
      const rangeMatch = task.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const [, start, end] = rangeMatch;
        const startNum = parseInt(start);
        const endNum = parseInt(end);
        for (let i = startNum; i <= endNum; i++) {
          expandedTasks.push(i.toString());
        }
      } else {
        expandedTasks.push(task);
      }
    }
    
    return expandedTasks;
  }

  /**
   * Parse priority from string
   */
  private parsePriority(priorityStr?: string): Priority {
    if (!priorityStr) {return Priority.NORMAL;}
    
    const lower = priorityStr.toLowerCase();
    switch (lower) {
      case 'low': return Priority.LOW;
      case 'high': return Priority.HIGH;
      case 'critical': return Priority.CRITICAL;
      default: return Priority.NORMAL;
    }
  }

  /**
   * Parse load balancing strategy
   */
  private parseBalanceStrategy(strategyStr?: string): 'round_robin' | 'capacity_based' | 'priority_weighted' {
    if (!strategyStr) {return 'round_robin';}
    
    const lower = strategyStr.toLowerCase();
    if (lower.includes('capacity')) {return 'capacity_based';}
    if (lower.includes('priority')) {return 'priority_weighted';}
    return 'round_robin';
  }

  /**
   * Generate suggestions for failed parsing
   */
  private generateSuggestions(input: string): string[] {
    const suggestions: string[] = [];
    
    // Common command templates
    if (input.includes('start') || input.includes('begin')) {
      suggestions.push('start wave <name> with teams <team-list>');
    }
    if (input.includes('assign') || input.includes('give')) {
      suggestions.push('assign teams <team-list> to tasks <task-list>');
    }
    if (input.includes('block') || input.includes('wait')) {
      suggestions.push('block team <name> on team <other-name> completion');
    }
    if (input.includes('sync') || input.includes('coordinate')) {
      suggestions.push('sync teams <team-list> on <condition>');
    }
    
    return suggestions.slice(0, 3); // Limit suggestions
  }

  /**
   * Validation helpers
   */
  private validateTeamAssignment(
    params: TeamAssignment,
    context: CommandContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): void {
    // Validate teams exist
    for (const team of params.teams) {
      if (!context.availableTeams.includes(team)) {
        errors.push(`Unknown team: ${team}`);
        const similar = this.findSimilarTeams(team, context.availableTeams);
        if (similar.length > 0) {
          suggestions.push(`Did you mean: ${similar.join(', ')}?`);
        }
      }
    }

    // Validate tasks if specified
    if (params.tasks) {
      for (const task of params.tasks) {
        if (!context.availableTasks.includes(task)) {
          warnings.push(`Task ${task} may not exist in current wave`);
        }
      }
    }
  }

  private validateTaskAssignment(
    params: TaskAssignment,
    context: CommandContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): void {
    // Validate team
    if (!context.availableTeams.includes(params.team)) {
      errors.push(`Unknown team: ${params.team}`);
    }

    // Validate task
    if (!context.availableTasks.includes(params.taskId)) {
      warnings.push(`Task ${params.taskId} may not exist in current wave`);
    }
  }

  private validateBlockingRelation(
    params: BlockingRelation,
    context: CommandContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): void {
    // Validate teams
    if (!context.availableTeams.includes(params.blockedTeam)) {
      errors.push(`Unknown blocked team: ${params.blockedTeam}`);
    }
    
    if (!context.availableTeams.includes(params.blockingTeam)) {
      errors.push(`Unknown blocking team: ${params.blockingTeam}`);
    }

    // Check for circular dependencies
    if (params.blockedTeam === params.blockingTeam) {
      errors.push('Team cannot block on itself');
    }
  }

  private validateSyncOperation(
    params: SyncOperation,
    context: CommandContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): void {
    // Validate teams
    for (const team of params.teams) {
      if (!context.availableTeams.includes(team)) {
        errors.push(`Unknown team: ${team}`);
      }
    }

    // Validate condition
    if (!params.condition || params.condition.trim().length === 0) {
      errors.push('Sync condition cannot be empty');
    }
  }

  private validateLoadBalance(
    params: LoadBalanceOperation,
    context: CommandContext,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): void {
    // Validate teams
    for (const team of params.teams) {
      if (!context.availableTeams.includes(team)) {
        errors.push(`Unknown team: ${team}`);
      }
    }

    // Check minimum teams for load balancing
    if (params.teams.length < 2) {
      warnings.push('Load balancing requires at least 2 teams');
    }
  }

  /**
   * Find similar team names for suggestions
   */
  private findSimilarTeams(input: string, availableTeams: string[]): string[] {
    const similar: string[] = [];
    const inputLower = input.toLowerCase();
    
    for (const team of availableTeams) {
      const teamLower = team.toLowerCase();
      
      // Exact substring match
      if (teamLower.includes(inputLower) || inputLower.includes(teamLower)) {
        similar.push(team);
        continue;
      }
      
      // Simple edit distance check
      if (this.editDistance(inputLower, teamLower) <= 2) {
        similar.push(team);
      }
    }
    
    return similar.slice(0, 3);
  }

  /**
   * Calculate simple edit distance
   */
  private editDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
}