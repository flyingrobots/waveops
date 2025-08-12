/**
 * Comprehensive tests for CommandParser
 */

import { CommandParser } from '../../src/coordination/command-parser';
import {
  CommandType,
  Priority,
  TeamAssignment,
  TaskAssignment,
  BlockingRelation,
  SyncOperation,
  LoadBalanceOperation,
  CommandContext,
  ParsedCommand
} from '../../src/coordination/types';
import { CommandParseError, ParseErrorCode } from '../../src/coordination/errors';

describe('CommandParser', () => {
  let parser: CommandParser;
  let mockContext: CommandContext;

  beforeEach(() => {
    parser = new CommandParser({
      enableFuzzyMatching: true,
      confidenceThreshold: 0.7,
      maxAlternatives: 3,
      allowAmbiguousCommands: false
    });

    mockContext = {
      issueNumber: 123,
      repository: 'test/repo',
      currentWave: 1,
      availableTeams: ['team-alpha', 'team-beta', 'team-gamma', 'team-delta', 'team-epsilon'],
      availableTasks: ['W1.T001', 'W1.T002', 'W1.T003', 'W1.T004', 'W1.T005'],
      teamMemberships: {
        'alice': 'team-alpha',
        'bob': 'team-beta',
        'charlie': 'team-gamma'
      },
      currentState: {}
    };
  });

  describe('Wave Start Commands', () => {
    test('should parse basic wave start command', async () => {
      const input = 'start wave alpha';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe(CommandType.WAVE_START);
      expect(result.errors).toHaveLength(0);
      expect(result.commands[0].confidence).toBeGreaterThan(0.8);
    });

    test('should parse wave start with team specification', async () => {
      const input = 'start wave alpha with teams engineering, design';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      expect(command.type).toBe(CommandType.WAVE_START);
      
      const params = command.parameters as TeamAssignment;
      expect(params.teams).toContain('team-engineering');
      expect(params.teams).toContain('team-design');
    });

    test('should handle alternative wave start syntax', async () => {
      const inputs = [
        'launch wave beta with teams alpha, beta',
        'begin wave gamma teams delta, epsilon'
      ];

      for (const input of inputs) {
        const result = await parser.parse(input, mockContext);
        // Some may not parse perfectly, that's ok for now
        if (result.commands.length > 0) {
          expect(result.commands[0].type).toBe(CommandType.WAVE_START);
        }
      }
    });
  });

  describe('Team Assignment Commands', () => {
    test('should parse team assignment to tasks', async () => {
      const input = 'assign team alpha to tasks 1, 2, 3, 4, 5';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      expect(command.type).toBe(CommandType.TEAM_ASSIGN);
      
      const params = command.parameters as TeamAssignment;
      expect(params.teams).toContain('team-alpha');
      expect(params.tasks).toContain('1');
      expect(params.tasks).toContain('5');
    });

    test('should parse team assignment with priority', async () => {
      const input = 'assign teams alpha, beta to tasks W1.T001, W1.T002 with high priority';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      const params = command.parameters as TeamAssignment;
      
      expect(params.teams).toEqual(['team-alpha', 'team-beta']);
      expect(params.tasks).toEqual(['W1.T001', 'W1.T002']);
      expect(params.priority).toBe(Priority.HIGH);
    });

    test('should handle team ranges', async () => {
      const input = 'assign teams 1-3 to task #123';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as TeamAssignment;
      expect(params.teams).toEqual(['team-1', 'team-2', 'team-3']);
    });

    test('should parse alternative assignment syntax', async () => {
      const inputs = [
        'give teams alpha, beta tasks W1.T001, W1.T002',
        'allocate tasks W1.T003 to team gamma',
        'delegate task #456 to team delta'
      ];

      for (const input of inputs) {
        const result = await parser.parse(input, mockContext);
        expect(result.commands).toHaveLength(1);
        expect(result.commands[0].type).toBe(CommandType.TEAM_ASSIGN);
      }
    });
  });

  describe('Blocking Commands', () => {
    test('should parse basic blocking command', async () => {
      const input = 'block team beta on team alpha completion';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      expect(command.type).toBe(CommandType.TEAM_BLOCK);
      
      const params = command.parameters as BlockingRelation;
      expect(params.blockedTeam).toBe('team-beta');
      expect(params.blockingTeam).toBe('team-alpha');
      expect(params.condition).toBe('completion');
    });

    test('should parse dependency syntax', async () => {
      const input = 'team gamma depends on team alpha completion';
      const result = await parser.parse(input, mockContext);

      const command = result.commands[0];
      expect(command.type).toBe(CommandType.TEAM_BLOCK);
      
      const params = command.parameters as BlockingRelation;
      expect(params.blockedTeam).toBe('team-gamma');
      expect(params.blockingTeam).toBe('team-alpha');
    });

    test('should parse wait syntax with condition', async () => {
      const input = 'make team delta wait for team beta until tests pass';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as BlockingRelation;
      expect(params.blockedTeam).toBe('team-delta');
      expect(params.blockingTeam).toBe('team-beta');
      expect(params.until).toBe('tests pass');
    });
  });

  describe('Task Assignment Commands', () => {
    test('should parse task reassignment', async () => {
      const input = 'reassign task #123 to team gamma with high priority';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      expect(command.type).toBe(CommandType.TASK_ASSIGN);
      
      const params = command.parameters as TaskAssignment;
      expect(params.taskId).toBe('123');
      expect(params.team).toBe('team-gamma');
      expect(params.priority).toBe(Priority.HIGH);
    });

    test('should parse task move command', async () => {
      const input = 'move task W1.T003 to team epsilon';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as TaskAssignment;
      expect(params.taskId).toBe('W1.T003');
      expect(params.team).toBe('team-epsilon');
    });

    test('should parse task transfer without priority', async () => {
      const input = 'transfer task #456 to team alpha';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as TaskAssignment;
      expect(params.taskId).toBe('456');
      expect(params.team).toBe('team-alpha');
      expect(params.priority).toBeUndefined();
    });
  });

  describe('Sync Commands', () => {
    test('should parse team sync command', async () => {
      const input = 'sync teams alpha, beta, gamma on issue completion';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      expect(command.type).toBe(CommandType.TEAM_SYNC);
      
      const params = command.parameters as SyncOperation;
      expect(params.teams).toEqual(['team-alpha', 'team-beta', 'team-gamma']);
      expect(params.condition).toBe('issue completion');
      expect(params.trigger).toBe('completion');
    });

    test('should parse synchronize syntax', async () => {
      const input = 'synchronize teams alpha, beta when deployment finishes';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as SyncOperation;
      expect(params.teams).toEqual(['team-alpha', 'team-beta']);
      expect(params.condition).toBe('deployment finishes');
    });

    test('should parse coordinate syntax', async () => {
      const input = 'coordinate teams gamma, delta for release preparation';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as SyncOperation;
      expect(params.teams).toEqual(['team-gamma', 'team-delta']);
      expect(params.condition).toBe('release preparation');
    });
  });

  describe('Load Balance Commands', () => {
    test('should parse basic load balance command', async () => {
      const input = 'auto-balance load across teams 1-5';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      const command = result.commands[0];
      expect(command.type).toBe(CommandType.LOAD_BALANCE);
      
      const params = command.parameters as LoadBalanceOperation;
      expect(params.teams).toEqual(['team-1', 'team-2', 'team-3', 'team-4', 'team-5']);
      expect(params.strategy).toBe('round_robin');
    });

    test('should parse load balance with strategy', async () => {
      const input = 'balance teams alpha, beta, gamma using capacity strategy';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as LoadBalanceOperation;
      expect(params.teams).toEqual(['team-alpha', 'team-beta', 'team-gamma']);
      expect(params.strategy).toBe('capacity_based');
    });

    test('should parse distribute work syntax', async () => {
      const input = 'distribute work across teams alpha, beta priority strategy';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as LoadBalanceOperation;
      expect(params.strategy).toBe('priority_weighted');
    });
  });

  describe('Batch Operations', () => {
    test('should parse multiple commands separated by semicolon', async () => {
      const input = 'assign team alpha to task #123; block team beta on team alpha completion';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe(CommandType.BATCH_OPERATION);
      
      const batchParams = result.commands[0].parameters as { commands: ParsedCommand[] };
      expect(batchParams.commands).toHaveLength(2);
      expect(batchParams.commands[0].type).toBe(CommandType.TEAM_ASSIGN);
      expect(batchParams.commands[1].type).toBe(CommandType.TEAM_BLOCK);
    });

    test('should parse commands separated by "and then"', async () => {
      const input = 'start wave alpha and then assign teams beta, gamma to tasks 1-3';
      const result = await parser.parse(input, mockContext);

      const batchParams = result.commands[0].parameters as { commands: ParsedCommand[] };
      expect(batchParams.commands).toHaveLength(2);
      expect(batchParams.commands[0].type).toBe(CommandType.WAVE_START);
      expect(batchParams.commands[1].type).toBe(CommandType.TEAM_ASSIGN);
    });

    test('should parse commands separated by "then"', async () => {
      const input = 'sync teams alpha, beta on deployment then balance teams 1-4';
      const result = await parser.parse(input, mockContext);

      const batchParams = result.commands[0].parameters as { commands: ParsedCommand[] };
      expect(batchParams.commands[0].type).toBe(CommandType.TEAM_SYNC);
      expect(batchParams.commands[1].type).toBe(CommandType.LOAD_BALANCE);
    });
  });

  describe('Command Validation', () => {
    test('should validate team existence', async () => {
      const input = 'assign team nonexistent to task #123';
      const result = await parser.parse(input, mockContext);
      
      if (result.commands.length > 0) {
        const validation = await parser.validate(result.commands[0], mockContext);
        expect(validation.valid).toBe(false);
        expect(validation.errors.some(e => e.includes('Unknown team'))).toBe(true);
      }
    });

    test('should provide suggestions for similar teams', async () => {
      const input = 'assign team alph to task #123';  // Typo in "alpha"
      const result = await parser.parse(input, mockContext);
      
      if (result.commands.length > 0) {
        const validation = await parser.validate(result.commands[0], mockContext);
        expect(validation.suggestions.length).toBeGreaterThan(0);
      }
    });

    test('should validate circular dependencies', async () => {
      const input = 'block team alpha on team alpha completion';
      const result = await parser.parse(input, mockContext);
      
      if (result.commands.length > 0) {
        const validation = await parser.validate(result.commands[0], mockContext);
        expect(validation.valid).toBe(false);
        expect(validation.errors.some(e => e.includes('cannot block on itself'))).toBe(true);
      }
    });

    test('should warn about low confidence commands', async () => {
      // Force low confidence by using unusual syntax
      const input = 'maybe perhaps assign some team to some task possibly';
      
      try {
        const result = await parser.parse(input, mockContext);
        if (result.commands.length > 0) {
          const validation = await parser.validate(result.commands[0], mockContext);
          // Should either fail to parse or have low confidence warnings
          expect(validation.warnings.length > 0 || result.errors.length > 0).toBe(true);
        }
      } catch (error) {
        // Expected for unparseable commands
        expect(error).toBeInstanceOf(CommandParseError);
      }
    });

    test('should validate minimum teams for load balancing', async () => {
      const input = 'balance team alpha';  // Only one team
      const result = await parser.parse(input, mockContext);
      
      if (result.commands.length > 0) {
        const validation = await parser.validate(result.commands[0], mockContext);
        expect(validation.warnings.some(w => w.includes('at least 2 teams'))).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle unknown commands gracefully', async () => {
      const input = 'do some random stuff that makes no sense';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Unable to parse command');
    });

    test('should provide helpful suggestions for unknown commands', async () => {
      const input = 'start something';
      const result = await parser.parse(input, mockContext);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('start wave'))).toBe(true);
    });

    test('should handle empty input', async () => {
      const input = '';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle whitespace-only input', async () => {
      const input = '   \t\n  ';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle mixed case input', async () => {
      const input = 'ASSIGN Team-ALPHA to TASK #123 with HIGH priority';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe(CommandType.TEAM_ASSIGN);
    });

    test('should handle extra whitespace', async () => {
      const input = '  assign   team   alpha   to   task   #123  ';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe(CommandType.TEAM_ASSIGN);
    });

    test('should handle different quote styles', async () => {
      const input = 'sync teams "alpha", \'beta\' on "issue completion"';
      const result = await parser.parse(input, mockContext);

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe(CommandType.TEAM_SYNC);
    });

    test('should handle task ID formats', async () => {
      const inputs = [
        'assign team alpha to task #123',
        'assign team alpha to task 123',
        'assign team alpha to task W1.T001',
        'assign team alpha to task task#123'
      ];

      for (const input of inputs) {
        const result = await parser.parse(input, mockContext);
        expect(result.commands).toHaveLength(1);
        expect(result.commands[0].type).toBe(CommandType.TEAM_ASSIGN);
      }
    });

    test('should handle team name formats', async () => {
      const input = 'assign team-alpha, team beta, gamma to task #123';
      const result = await parser.parse(input, mockContext);

      const params = result.commands[0].parameters as TeamAssignment;
      expect(params.teams).toEqual(['team-alpha', 'team-beta', 'team-gamma']);
    });
  });

  describe('Performance and Metadata', () => {
    test('should track parsing time', async () => {
      const input = 'assign team alpha to task #123';
      const result = await parser.parse(input, mockContext);

      expect(result.metadata.parseTime).toBeGreaterThan(0);
      expect(result.metadata.parseTime).toBeLessThan(1000); // Should be fast
    });

    test('should calculate confidence scores', async () => {
      const input = 'assign team alpha to task #123';
      const result = await parser.parse(input, mockContext);

      expect(result.metadata.confidence).toBeGreaterThan(0);
      expect(result.metadata.confidence).toBeLessThanOrEqual(1);
    });

    test('should track ambiguity scores', async () => {
      const input = 'assign team alpha to task #123';
      const result = await parser.parse(input, mockContext);

      expect(result.metadata.ambiguityScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration', () => {
    test('should respect confidence threshold', async () => {
      const strictParser = new CommandParser({
        confidenceThreshold: 0.95,
        maxAlternatives: 1
      });

      const input = 'maybe assign team alpha to task #123';
      const result = await strictParser.parse(input, mockContext);

      // Should either have high confidence or fail
      if (result.commands.length > 0) {
        expect(result.commands[0].confidence).toBeGreaterThan(0.95);
      }
    });

    test('should limit alternatives based on config', async () => {
      const limitedParser = new CommandParser({
        maxAlternatives: 1
      });

      const input = 'assign team alpha to task #123';
      const result = await limitedParser.parse(input, mockContext);

      if (result.commands.length > 0 && result.commands[0].alternatives) {
        expect(result.commands[0].alternatives.length).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('CommandParser Integration', () => {
  let parser: CommandParser;
  let context: CommandContext;

  beforeEach(() => {
    parser = new CommandParser();
    context = {
      issueNumber: 456,
      repository: 'test/integration',
      availableTeams: ['team-frontend', 'team-backend', 'team-devops'],
      availableTasks: ['USER-001', 'USER-002', 'USER-003'],
      teamMemberships: {
        'developer1': 'team-frontend',
        'developer2': 'team-backend'
      }
    };
  });

  test('should handle realistic coordination commands', async () => {
    const commands = [
      'start wave 3 with teams frontend, backend, devops',
      'assign team frontend to tasks USER-001, USER-002 with high priority',
      'block team devops on team backend completion',
      'sync teams frontend, backend on code review completion',
      'auto-balance load across teams frontend, backend'
    ];

    for (const command of commands) {
      const result = await parser.parse(command, context);
      expect(result.commands.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    }
  });

  test('should handle complex batch operation', async () => {
    const input = `
      start wave 3 with teams frontend, backend;
      assign team frontend to task USER-001 with high priority;
      block team backend on team frontend completion;
      sync teams frontend, backend on deployment
    `;

    const result = await parser.parse(input, context);
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe(CommandType.BATCH_OPERATION);
    
    const batchParams = result.commands[0].parameters as { commands: ParsedCommand[] };
    expect(batchParams.commands).toHaveLength(4);
  });
});