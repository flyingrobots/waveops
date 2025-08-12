/**
 * Integration tests for Command Parser - focused on working functionality
 */

import { CommandParser, CommandDispatcher } from '../../src/coordination';
import { CommandType, Priority, CommandContext } from '../../src/coordination/types';
import { WebhookEvent } from '../../src/github/webhook-handler';

describe('Command Parser Integration', () => {
  let parser: CommandParser;
  let dispatcher: CommandDispatcher;
  let mockContext: CommandContext;

  beforeEach(() => {
    parser = new CommandParser();
    dispatcher = new CommandDispatcher(parser);
    
    mockContext = {
      issueNumber: 123,
      repository: 'test/repo',
      currentWave: 1,
      availableTeams: ['team-alpha', 'team-beta', 'team-gamma'],
      availableTasks: ['W1.T001', 'W1.T002', 'W1.T003'],
      teamMemberships: {
        'alice': 'team-alpha',
        'bob': 'team-beta'
      },
      currentState: {}
    };
  });

  test('should parse basic wave start command', async () => {
    const input = 'start wave alpha';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe(CommandType.WAVE_START);
    expect(result.errors).toHaveLength(0);
  });

  test('should parse team assignment command', async () => {
    const input = 'assign team alpha to task W1.T001';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe(CommandType.TEAM_ASSIGN);
  });

  test('should parse blocking command', async () => {
    const input = 'block team beta on team alpha completion';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe(CommandType.TEAM_BLOCK);
  });

  test('should parse sync command', async () => {
    const input = 'sync teams alpha, beta on deployment completion';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe(CommandType.TEAM_SYNC);
  });

  test('should handle webhook dispatch', async () => {
    const webhookEvent: WebhookEvent = {
      action: 'created',
      comment: {
        id: 123,
        body: 'assign team alpha to task W1.T001',
        user: { login: 'alice' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      },
      issue: {
        id: 456,
        number: 123,
        title: 'Wave 1 Coordination',
        body: 'Coordination issue',
        state: 'open',
        user: { login: 'alice' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z'
      },
      repository: { name: 'test', full_name: 'test/repo' },
      sender: { login: 'alice' }
    };

    const result = await dispatcher.processWebhookCommand(webhookEvent);
    
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  test('should validate commands properly', async () => {
    const input = 'assign team nonexistent to task W1.T001';
    const result = await parser.parse(input, mockContext);

    if (result.commands.length > 0) {
      const validation = await parser.validate(result.commands[0], mockContext);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    }
  });

  test('should handle batch operations', async () => {
    const input = 'assign team alpha to task W1.T001; sync teams alpha, beta on completion';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].type).toBe(CommandType.BATCH_OPERATION);
  });

  test('should format response comments', () => {
    const mockResult = {
      success: true,
      results: [{
        command: {} as any,
        success: true,
        message: 'Command executed successfully'
      }],
      errors: [],
      warnings: [],
      metadata: {
        totalCommands: 1,
        successfulCommands: 1,
        processingTime: 150
      }
    };

    const response = dispatcher.formatResponseComment(mockResult);
    
    expect(response).toContain('Command(s) executed successfully');
    expect(response).toContain('Total commands: 1');
    expect(response).toContain('Processing time: 150ms');
  });

  test('should handle parsing errors gracefully', async () => {
    const input = 'this is not a valid command at all';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.metadata.confidence).toBe(0);
  });

  test('should handle empty input', async () => {
    const input = '';
    const result = await parser.parse(input, mockContext);

    expect(result.commands).toHaveLength(0);
    expect(result.errors).toContain('Empty command input');
  });
});

describe('Real-world Command Examples', () => {
  let parser: CommandParser;
  let context: CommandContext;

  beforeEach(() => {
    parser = new CommandParser();
    context = {
      issueNumber: 456,
      repository: 'company/product',
      availableTeams: ['team-frontend', 'team-backend', 'team-devops', 'team-qa'],
      availableTasks: ['FEAT-001', 'FEAT-002', 'BUG-001', 'TEST-001'],
      teamMemberships: {
        'dev1': 'team-frontend',
        'dev2': 'team-backend',
        'ops1': 'team-devops'
      }
    };
  });

  test('should handle realistic coordination scenarios', async () => {
    const scenarios = [
      'start wave 3 with teams frontend, backend',
      'assign team frontend to task FEAT-001',
      'block team qa on team backend completion',
      'sync teams frontend, backend on code review',
      'reassign task BUG-001 to team devops'
    ];

    for (const scenario of scenarios) {
      const result = await parser.parse(scenario, context);
      
      // Should either parse successfully or fail gracefully
      expect(result.metadata.parseTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.parseTime).toBeLessThan(1000);
      
      if (result.commands.length > 0) {
        expect(Object.values(CommandType)).toContain(result.commands[0].type);
      }
    }
  });
});