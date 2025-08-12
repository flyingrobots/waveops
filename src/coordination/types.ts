/**
 * Types for command parsing and execution
 */

export enum CommandType {
  WAVE_START = 'wave_start',
  TEAM_ASSIGN = 'team_assign',
  TEAM_BLOCK = 'team_block',
  TEAM_SYNC = 'team_sync',
  TASK_ASSIGN = 'task_assign',
  TASK_PRIORITY = 'task_priority',
  LOAD_BALANCE = 'load_balance',
  DEPENDENCY_ADD = 'dependency_add',
  DEPENDENCY_REMOVE = 'dependency_remove',
  STATUS_QUERY = 'status_query',
  BATCH_OPERATION = 'batch_operation'
}

export enum Priority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

export interface TeamAssignment {
  teams: string[];
  tasks?: string[];
  priority?: Priority;
  dependencies?: string[];
}

export interface TaskAssignment {
  taskId: string;
  team: string;
  priority?: Priority;
  dependencies?: string[];
}

export interface BlockingRelation {
  blockedTeam: string;
  blockingTeam: string;
  condition?: string;
  until?: string;
}

export interface SyncOperation {
  teams: string[];
  condition: string;
  trigger?: string;
}

export interface LoadBalanceOperation {
  teams: string[];
  strategy?: 'round_robin' | 'capacity_based' | 'priority_weighted';
  constraints?: Record<string, unknown>;
}

export interface ParsedCommand {
  type: CommandType;
  raw: string;
  actor: string;
  timestamp: Date;
  parameters: CommandParameters;
  confidence: number;
  alternatives?: ParsedCommand[];
}

export type CommandParameters = 
  | TeamAssignment
  | TaskAssignment
  | BlockingRelation
  | SyncOperation
  | LoadBalanceOperation
  | { query: string }
  | { commands: ParsedCommand[] };

export interface CommandContext {
  issueNumber: number;
  repository: string;
  currentWave?: number;
  availableTeams: string[];
  availableTasks: string[];
  teamMemberships: Record<string, string>;
  currentState?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ParserConfig {
  enableFuzzyMatching: boolean;
  confidenceThreshold: number;
  maxAlternatives: number;
  allowAmbiguousCommands: boolean;
  vocabularyExtensions: Record<string, string[]>;
}

export interface ParseResult {
  commands: ParsedCommand[];
  errors: string[];
  warnings: string[];
  metadata: {
    parseTime: number;
    confidence: number;
    ambiguityScore: number;
  };
}