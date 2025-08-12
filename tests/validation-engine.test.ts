/**
 * Tests for Validation Engine (W2.T002 - Alice)
 * Task completion validation logic tests
 */

import { ValidationEngine } from '../src/core/validation-engine';
import { GitHubClient } from '../src/github/client';
import { GitHubPullRequest, GitHubCommitChecks, GitHubIssue } from '../src/types';

// Mock GitHubClient
jest.mock('../src/github/client');

describe('Validation Engine (W2.T002)', () => {
  let validationEngine: ValidationEngine;
  let mockClient: jest.Mocked<GitHubClient>;

  beforeEach(() => {
    mockClient = new GitHubClient({ auth: 'test' }, 'test-owner', 'test-repo') as jest.Mocked<GitHubClient>;
    // Set the owner and repo properties for the mock
    Object.defineProperty(mockClient, 'owner', { value: 'test-owner', writable: false });
    Object.defineProperty(mockClient, 'repo', { value: 'test-repo', writable: false });
    validationEngine = new ValidationEngine(mockClient);
  });

  describe('Task completion validation', () => {
    it('should validate successfully when all criteria are met', async () => {
      // Mock successful scenario
      const closedIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'closed',
        user: { login: 'alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mergedPR: GitHubPullRequest = {
        id: 1,
        number: 456,
        title: 'Fix test issue',
        merged: true,
        merge_commit_sha: 'abc123',
        state: 'closed',
        user: { login: 'alice' }
      };

      const successfulChecks: GitHubCommitChecks = {
        statuses: [
          { state: 'success', context: 'ci/test', description: 'Tests passed', target_url: null }
        ],
        checkRuns: [],
        state: 'success'
      };

      mockClient.getIssue.mockResolvedValue(closedIssue);
      mockClient.getClosingPullRequest.mockResolvedValue(mergedPR);
      mockClient.getCommitChecks.mockResolvedValue(successfulChecks);

      const result = await validationEngine.validateTaskCompletion('W2.T001', 123);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details.issueClosedByPR).toBe(true);
      expect(result.details.prMerged).toBe(true);
      expect(result.details.ciChecksPass).toBe(true);
    });

    it('should fail validation when issue is not closed', async () => {
      const openIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        user: { login: 'alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockClient.getIssue.mockResolvedValue(openIssue);

      const result = await validationEngine.validateTaskCompletion('W2.T001', 123);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Issue #123 is not closed');
      expect(result.errors[0]).toContain('W2.T001');
    });

    it('should fail validation when no closing PR exists', async () => {
      const closedIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'closed',
        user: { login: 'alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockClient.getIssue.mockResolvedValue(closedIssue);
      mockClient.getClosingPullRequest.mockResolvedValue(null);

      const result = await validationEngine.validateTaskCompletion('W2.T001', 123);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('was not closed by a merged PR');
    });

    it('should fail validation when PR is not merged', async () => {
      const closedIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'closed',
        user: { login: 'alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const unmergedPR: GitHubPullRequest = {
        id: 1,
        number: 456,
        title: 'Fix test issue',
        merged: false,
        merge_commit_sha: null,
        state: 'open',
        user: { login: 'alice' }
      };

      mockClient.getIssue.mockResolvedValue(closedIssue);
      mockClient.getClosingPullRequest.mockResolvedValue(unmergedPR);

      const result = await validationEngine.validateTaskCompletion('W2.T001', 123);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('is not merged');
      expect(result.errors[0]).toContain('PR #456');
    });

    it('should fail validation when CI checks fail', async () => {
      const closedIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'closed',
        user: { login: 'alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const mergedPR: GitHubPullRequest = {
        id: 1,
        number: 456,
        title: 'Fix test issue',
        merged: true,
        merge_commit_sha: 'abc123',
        state: 'closed',
        user: { login: 'alice' }
      };

      const failedChecks: GitHubCommitChecks = {
        statuses: [
          { state: 'failure', context: 'ci/test', description: 'Tests failed', target_url: 'http://example.com/build/123' }
        ],
        checkRuns: [],
        state: 'failure'
      };

      mockClient.getIssue.mockResolvedValue(closedIssue);
      mockClient.getClosingPullRequest.mockResolvedValue(mergedPR);
      mockClient.getCommitChecks.mockResolvedValue(failedChecks);

      const result = await validationEngine.validateTaskCompletion('W2.T001', 123);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('CI checks failed');
      expect(result.errors[0]).toContain('CI status: failure');
    });
  });

  describe('Team validation summary', () => {
    it('should provide correct team readiness summary', async () => {
      const teamTasks = [
        { taskId: 'W2.T001', issueNumber: 123 },
        { taskId: 'W2.T002', issueNumber: 124 }
      ];

      // Mock first call succeeds, second fails
      mockClient.getIssue
        .mockResolvedValueOnce({
          id: 1,
          number: 123,
          title: 'Test Issue',
          body: 'Test body',
          state: 'closed',
          user: { login: 'alice' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        })
        .mockResolvedValueOnce({
          id: 2,
          number: 124,
          title: 'Test Issue 2',
          body: 'Test body 2',
          state: 'open',
          user: { login: 'alice' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        });

      mockClient.getClosingPullRequest.mockResolvedValue({
        id: 1,
        number: 456,
        title: 'Fix issue',
        merged: true,
        merge_commit_sha: 'abc123',
        state: 'closed',
        user: { login: 'alice' }
      });

      mockClient.getCommitChecks.mockResolvedValue({
        statuses: [],
        checkRuns: [],
        state: 'success'
      });

      const summary = await validationEngine.getTeamValidationSummary(teamTasks);

      expect(summary.allValid).toBe(false);
      expect(summary.validTasks).toEqual(['W2.T001']);
      expect(summary.invalidTasks).toEqual(['W2.T002']);
      expect(summary.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error messages', () => {
    it('should provide helpful error messages with links', async () => {
      const openIssue: GitHubIssue = {
        id: 1,
        number: 123,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        user: { login: 'alice' },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockClient.getIssue.mockResolvedValue(openIssue);

      const result = await validationEngine.validateTaskCompletion('W2.T001', 123);

      expect(result.errors[0]).toContain('W2.T001');
      expect(result.errors[0]).toContain('Issue #123');
      expect(result.errors[0]).toContain('https://github.com/test-owner/test-repo/issues/123');
    });
  });
});