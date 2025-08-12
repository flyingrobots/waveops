/**
 * Tests for Enhanced Command Parser (W2.T001 - Alice)
 * Demonstrates improved parsing resilience and team authorization
 */

import { WebhookHandler, WebhookEvent } from '../src/github/webhook-handler';
import { GitHubIssue, GitHubIssueComment } from '../src/types';

// Test helper functions
function createMockIssue(partial: Partial<GitHubIssue>): GitHubIssue {
  return {
    id: 1,
    number: 1,
    title: 'Test Issue',
    body: 'Test body',
    state: 'open',
    user: { login: 'testuser' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...partial
  };
}

function createMockComment(partial: Partial<GitHubIssueComment>): GitHubIssueComment {
  return {
    id: 1,
    body: 'Test comment',
    user: { login: 'testuser' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...partial
  };
}

describe('Enhanced Command Parser (W2.T001)', () => {
  
  describe('Resilient parsing for formatting variations', () => {
    it('should parse /ready with multiple wave formats', () => {
      const testCases = [
        { body: '/ready wave-2', expected: 2 },
        { body: '/ready wave:2', expected: 2 },
        { body: '/ready wave2', expected: 2 },
        { body: '/ready 2', expected: 2 },
        { body: '/ready Wave-2', expected: 2 } // case insensitive
      ];

      testCases.forEach(({ body, expected }) => {
        const event: WebhookEvent = {
          action: 'created',
          comment: createMockComment({ body }),
          issue: createMockIssue({ number: 24 }),
          sender: { login: 'alice' },
          repository: {},
        };

        const parsed = WebhookHandler.parseComment(event);
        expect(parsed).not.toBeNull();
        if (parsed) {
          expect(parsed.command).toBe('ready');
          expect(parsed.args.wave).toBe(expected);
        }
      });
    });

    it('should parse /blocked with flexible reason formats', () => {
      const testCases = [
        { body: '/blocked reason:"CI is flaky"', expected: 'CI is flaky' },
        { body: '/blocked reason:\'CI is flaky\'', expected: 'CI is flaky' },
        { body: '/blocked reason=CI is flaky', expected: 'CI is flaky' },
        { body: '/blocked reason: "Missing dependencies"', expected: 'Missing dependencies' },
        { body: '/blocked REASON:"Case insensitive"', expected: 'Case insensitive' }
      ];

      testCases.forEach(({ body, expected }) => {
        const event: WebhookEvent = {
          action: 'created',
          comment: createMockComment({ body }),
          issue: createMockIssue({ number: 24 }),
          sender: { login: 'bob' },
          repository: {},
        };

        const parsed = WebhookHandler.parseComment(event);
        expect(parsed).not.toBeNull();
        if (parsed) {
          expect(parsed.command).toBe('blocked');
          expect(parsed.args.reason).toBe(expected);
        }
      });
    });
  });

  describe('Team authorization validation', () => {
    it('should validate team membership correctly', async () => {
      const aliceValidation = await WebhookHandler.validateTeamMembership('alice', 'ready', { wave: 2 });
      expect(aliceValidation.valid).toBe(true);
      expect(aliceValidation.team).toBe('alpha');

      const bobValidation = await WebhookHandler.validateTeamMembership('bob', 'ready', { wave: 2 });
      expect(bobValidation.valid).toBe(true);
      expect(bobValidation.team).toBe('beta');

      const unknownValidation = await WebhookHandler.validateTeamMembership('charlie', 'ready', { wave: 2 });
      expect(unknownValidation.valid).toBe(false);
      expect(unknownValidation.error).toContain('not a member of any team');
    });

    it('should enforce task assignment authorization', async () => {
      // Alice should be able to claim alpha tasks
      const aliceAlphaTask = await WebhookHandler.validateTeamMembership('alice', 'claim', { task: 'W2.T001' });
      expect(aliceAlphaTask.valid).toBe(true);

      // Alice should NOT be able to claim beta tasks
      const aliceBetaTask = await WebhookHandler.validateTeamMembership('alice', 'claim', { task: 'W2.T003' });
      expect(aliceBetaTask.valid).toBe(false);
      expect(aliceBetaTask.error).toContain('assigned to team beta');

      // Bob should be able to claim beta tasks
      const bobBetaTask = await WebhookHandler.validateTeamMembership('bob', 'claim', { task: 'W2.T004' });
      expect(bobBetaTask.valid).toBe(true);

      // Bob should NOT be able to claim alpha tasks
      const bobAlphaTask = await WebhookHandler.validateTeamMembership('bob', 'claim', { task: 'W2.T002' });
      expect(bobAlphaTask.valid).toBe(false);
      expect(bobAlphaTask.error).toContain('assigned to team alpha');
    });
  });

  describe('Command parsing completeness', () => {
    it('should handle all WaveOps commands', () => {
      const commands = [
        '/ready wave-2',
        '/blocked reason:"test"', 
        '/claim W2.T001',
        '/release W2.T001',
        '/spec list',
        '/status'
      ];

      commands.forEach(body => {
        const event: WebhookEvent = {
          action: 'created',
          comment: createMockComment({ body }),
          issue: createMockIssue({ number: 24 }),
          sender: { login: 'alice' },
          repository: {},
        };

        const parsed = WebhookHandler.parseComment(event);
        expect(parsed).not.toBeNull();
        if (parsed) {
          expect(parsed.command).toBeTruthy();
          expect(parsed.actor).toBe('alice');
        }
      });
    });
  });
});