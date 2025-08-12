/**
 * Custom error types for command parsing
 */

export enum ParseErrorCode {
  INVALID_SYNTAX = 1,
  UNKNOWN_COMMAND = 2,
  INVALID_TEAM = 3,
  INVALID_TASK = 4,
  INVALID_PRIORITY = 5,
  MISSING_ARGUMENTS = 6,
  CIRCULAR_DEPENDENCY = 7,
  UNAUTHORIZED = 8,
  AMBIGUOUS_COMMAND = 9,
  INVALID_RANGE = 10
}

export class CommandParseError extends Error {
  public readonly code: ParseErrorCode;
  public readonly position?: number;
  public readonly suggestions?: string[];
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ParseErrorCode,
    options: {
      position?: number;
      suggestions?: string[];
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = 'CommandParseError';
    this.code = code;
    this.position = options.position;
    this.suggestions = options.suggestions;
    this.context = options.context;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      position: this.position,
      suggestions: this.suggestions,
      context: this.context
    };
  }
}

export class CommandValidationError extends Error {
  public readonly code: ParseErrorCode;
  public readonly field: string;
  public readonly value?: unknown;

  constructor(message: string, code: ParseErrorCode, field: string, value?: unknown) {
    super(message);
    this.name = 'CommandValidationError';
    this.code = code;
    this.field = field;
    this.value = value;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      field: this.field,
      value: this.value
    };
  }
}

export class CommandExecutionError extends Error {
  public readonly command: string;
  public readonly reason: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, command: string, reason: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'CommandExecutionError';
    this.command = command;
    this.reason = reason;
    this.context = context;
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      command: this.command,
      reason: this.reason,
      context: this.context
    };
  }
}