/**
 * Tests for Webhook Handler
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

describe('WebhookHandler', () => {
  it('should identify coordination issues correctly', () => {
    const coordinationIssue = createMockIssue({ title: 'Wave 1 · waveops-v1 · Coordination' });
    const regularIssue = createMockIssue({ title: 'Fix bug in user authentication' });
    
    expect(WebhookHandler.isCoordinationIssue(coordinationIssue)).toBe(true);
    expect(WebhookHandler.isCoordinationIssue(regularIssue)).toBe(false);
  });

  it('should parse /ready command correctly', () => {
    const event: WebhookEvent = {
      action: 'created',
      comment: createMockComment({ body: '/ready wave-1' }),
      issue: createMockIssue({ number: 18 }),
      sender: { login: 'alice' },
      repository: {},
    };

    const parsed = WebhookHandler.parseComment(event);

    expect(parsed).not.toBeNull();
    if (parsed) {
      expect(parsed.command).toBe('ready');
      expect(parsed.args.wave).toBe(1);
      expect(parsed.actor).toBe('alice');
      expect(parsed.issueNumber).toBe(18);
    }
  });

  it('should parse /blocked command with reason', () => {
    const event: WebhookEvent = {
      action: 'created',
      comment: createMockComment({ body: '/blocked reason:"CI is flaky on macOS"' }),
      issue: createMockIssue({ number: 18 }),
      sender: { login: 'bob' },
      repository: {},
    };

    const parsed = WebhookHandler.parseComment(event);

    expect(parsed).not.toBeNull();
    if (parsed) {
      expect(parsed.command).toBe('blocked');
      expect(parsed.args.reason).toBe('CI is flaky on macOS');
      expect(parsed.actor).toBe('bob');
    }
  });

  it('should parse /claim command', () => {
    const event: WebhookEvent = {
      action: 'created',
      comment: createMockComment({ body: '/claim W2.T001' }),
      issue: createMockIssue({ number: 18 }),
      sender: { login: 'alice' },
      repository: {},
    };

    const parsed = WebhookHandler.parseComment(event);

    expect(parsed).not.toBeNull();
    if (parsed) {
      expect(parsed.command).toBe('claim');
      expect(parsed.args.task).toBe('W2.T001');
    }
  });

  it('should route events correctly', () => {
    const issueCommentEvent: WebhookEvent = {
      action: 'created',
      comment: createMockComment({ body: '/ready wave-1' }),
      issue: createMockIssue({ number: 18 }),
      sender: { login: 'alice' },
      repository: {}
    };

    const issuesEvent: WebhookEvent = {
      action: 'opened',
      issue: createMockIssue({ number: 19, title: 'New issue' }),
      sender: { login: 'bob' },
      repository: {}
    };

    expect(WebhookHandler.routeEvent(issueCommentEvent)).toBe('issue_comment');
    expect(WebhookHandler.routeEvent(issuesEvent)).toBe('issues');
  });

  it('should extract wave number from title', () => {
    expect(WebhookHandler.extractWaveNumber('Wave 1 · waveops-v1 · Coordination')).toBe(1);
    expect(WebhookHandler.extractWaveNumber('Wave 42 coordination')).toBe(42);
    expect(WebhookHandler.extractWaveNumber('Regular issue title')).toBe(null);
  });

  it('should filter events correctly', () => {
    const coordinationEvent: WebhookEvent = {
      action: 'created',
      issue: createMockIssue({ title: 'Wave 1 · Coordination' }),
      sender: { login: 'alice' },
      repository: {}
    };

    const regularEvent: WebhookEvent = {
      action: 'created', 
      issue: createMockIssue({ title: 'Fix bug' }),
      sender: { login: 'bob' },
      repository: {}
    };

    expect(WebhookHandler.shouldProcessEvent(coordinationEvent)).toBe(true);
    expect(WebhookHandler.shouldProcessEvent(regularEvent)).toBe(false);
  });

  it('should handle malformed commands gracefully', () => {
    const event: WebhookEvent = {
      action: 'created',
      comment: createMockComment({ body: 'Not a slash command' }),
      issue: createMockIssue({ number: 18 }),
      sender: { login: 'alice' },
      repository: {}
    };

    const parsed = WebhookHandler.parseComment(event);
    expect(parsed).toBeNull();
  });
});