/**
 * Validation Engine (W2.T002) - Task completion validation logic
 * Implemented by Alice for Team Alpha
 */

import { GitHubClient } from '../github/client';
import { GitHubPullRequest, GitHubCommitChecks } from '../types';

export interface TaskValidationResult {
  valid: boolean;
  taskId: string;
  issueNumber: number;
  errors: string[];
  details: {
    issueClosedByPR?: boolean;
    prMerged?: boolean;
    ciChecksPass?: boolean;
    closingPR?: GitHubPullRequest;
    checkResults?: GitHubCommitChecks;
  };
}

export interface ValidationError {
  type: 'issue_not_closed' | 'no_closing_pr' | 'pr_not_merged' | 'ci_checks_failed';
  message: string;
  link?: string;
  details?: string;
}

export class ValidationEngine {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  /**
   * Validate that a task has been completed according to WaveOps standards
   */
  async validateTaskCompletion(taskId: string, issueNumber: number): Promise<TaskValidationResult> {
    const result: TaskValidationResult = {
      valid: false,
      taskId,
      issueNumber,
      errors: [],
      details: {}
    };

    try {
      // Step 1: Check if issue is closed
      const issue = await this.client.getIssue(issueNumber);
      
      if (!issue || issue.state !== 'closed') {
        result.errors.push(this.createValidationError('issue_not_closed', {
          taskId,
          issueNumber,
          link: `https://github.com/${this.client.owner}/${this.client.repo}/issues/${issueNumber}`
        }));
        return result;
      }

      // Step 2: Find the PR that closed the issue  
      const closingPR = await this.client.getClosingPullRequest();
      result.details.closingPR = closingPR || undefined;

      if (!closingPR) {
        result.errors.push(this.createValidationError('no_closing_pr', {
          taskId,
          issueNumber,
          link: `https://github.com/${this.client.owner}/${this.client.repo}/issues/${issueNumber}`
        }));
        return result;
      }

      result.details.issueClosedByPR = true;

      // Step 3: Verify PR is merged
      if (!closingPR.merged) {
        result.errors.push(this.createValidationError('pr_not_merged', {
          taskId,
          issueNumber,
          prNumber: closingPR.number,
          link: `https://github.com/${this.client.owner}/${this.client.repo}/pull/${closingPR.number}`
        }));
        return result;
      }

      result.details.prMerged = true;

      // Step 4: Validate CI checks passed
      if (closingPR.merge_commit_sha) {
        const checkResults = await this.client.getCommitChecks();
        result.details.checkResults = checkResults;

        if (checkResults.state !== 'success') {
          result.errors.push(this.createValidationError('ci_checks_failed', {
            taskId,
            issueNumber,
            prNumber: closingPR.number,
            link: `https://github.com/${this.client.owner}/${this.client.repo}/pull/${closingPR.number}/checks`,
            details: `CI status: ${checkResults.state}, Failed checks: ${checkResults.statuses.filter(s => s.state !== 'success').length}`
          }));
          return result;
        }

        result.details.ciChecksPass = true;
      }

      // All validations passed!
      result.valid = true;
      return result;

    } catch (error) {
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Validate multiple tasks in parallel
   */
  async validateTasks(tasks: Array<{ taskId: string; issueNumber: number }>): Promise<TaskValidationResult[]> {
    const validationPromises = tasks.map(task => 
      this.validateTaskCompletion(task.taskId, task.issueNumber)
    );

    return Promise.all(validationPromises);
  }

  /**
   * Create descriptive validation error messages with helpful links
   */
  private createValidationError(type: ValidationError['type'], context: {
    taskId: string;
    issueNumber: number;
    prNumber?: number;
    link?: string;
    details?: string;
  }): string {
    const { taskId, issueNumber, prNumber, link, details } = context;

    switch (type) {
      case 'issue_not_closed':
        return `❌ ${taskId}: Issue #${issueNumber} is not closed. Please complete the task and close the issue. ${link || ''}`;

      case 'no_closing_pr':
        return `❌ ${taskId}: Issue #${issueNumber} was not closed by a merged PR. Please create and merge a PR that closes this issue. ${link || ''}`;

      case 'pr_not_merged':
        return `❌ ${taskId}: PR #${prNumber} that closes issue #${issueNumber} is not merged. Please merge the PR after all checks pass. ${link || ''}`;

      case 'ci_checks_failed':
        return `❌ ${taskId}: CI checks failed for PR #${prNumber} (closes #${issueNumber}). Please fix failing checks before marking ready. ${link || ''} ${details ? `\nDetails: ${details}` : ''}`;

      default:
        return `❌ ${taskId}: Unknown validation error for issue #${issueNumber}`;
    }
  }

  /**
   * Get validation summary for team readiness
   */
  async getTeamValidationSummary(teamTasks: Array<{ taskId: string; issueNumber: number }>): Promise<{
    allValid: boolean;
    validTasks: string[];
    invalidTasks: string[];
    errors: string[];
  }> {
    const results = await this.validateTasks(teamTasks);
    
    const validTasks = results.filter(r => r.valid).map(r => r.taskId);
    const invalidTasks = results.filter(r => !r.valid).map(r => r.taskId);
    const errors = results.flatMap(r => r.errors);

    return {
      allValid: results.every(r => r.valid),
      validTasks,
      invalidTasks,
      errors
    };
  }
}