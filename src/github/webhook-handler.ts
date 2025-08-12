/**
 * Webhook event handling and routing
 */

import { GitHubIssue, GitHubPullRequest, GitHubIssueComment, GitHubCheckRun } from '../types';

export interface WebhookEvent {
  action: string;
  issue?: GitHubIssue;
  pull_request?: GitHubPullRequest;
  comment?: GitHubIssueComment;
  check_run?: GitHubCheckRun;
  check_suite?: unknown;
  repository: unknown;
  sender: { login: string };
}

export interface ParsedComment {
  command: string;
  args: Record<string, unknown>;
  actor: string;
  issueNumber: number;
}

export class WebhookHandler {
  /**
   * Route webhook events to appropriate handlers
   */
  static routeEvent(event: WebhookEvent): 'issue_comment' | 'issues' | 'pull_request' | 'check_run' | 'unknown' {
    if (event.comment && event.issue) {
      return 'issue_comment';
    }
    
    if (event.issue && !event.comment) {
      return 'issues';
    }
    
    if (event.pull_request) {
      return 'pull_request';
    }
    
    if (event.check_run) {
      return 'check_run';
    }
    
    return 'unknown';
  }

  /**
   * Check if issue is a coordination issue
   */
  static isCoordinationIssue(issue: GitHubIssue | undefined): boolean {
    if (!issue || !issue.title) {
      return false;
    }
    
    const title = issue.title.toLowerCase();
    return title.includes('wave') && title.includes('coordination');
  }

  /**
   * Parse comment for slash commands
   */
  static parseComment(event: WebhookEvent): ParsedComment | null {
    if (!event.comment || !event.issue) {return null;}
    
    const body = event.comment.body.trim();
    const actor = event.sender.login;
    const issueNumber = event.issue.number;

    // Check if it's a slash command
    if (!body.startsWith('/')) {return null;}

    const parts = body.split(/\s+/);
    const command = parts[0].substring(1); // Remove leading slash
    const args: Record<string, string | number> = {};

    // Parse common command patterns
    switch (command) {
      case 'ready':
        if (parts[1] && parts[1].startsWith('wave-')) {
          args.wave = parseInt(parts[1].replace('wave-', ''));
        }
        break;
        
      case 'blocked': {
        // Parse reason:"..." format
        const reasonMatch = body.match(/reason:"([^"]+)"/);
        if (reasonMatch) {
          args.reason = reasonMatch[1];
        }
        break;
      }
        
      case 'claim':
        if (parts[1]) {
          args.task = parts[1] === 'next' ? 'next' : parts[1];
        }
        break;
        
      case 'release':
        if (parts[1]) {
          args.task = parts[1];
        }
        break;
        
      case 'spec':
        if (parts[1]) {
          args.action = parts[1]; // 'list' or 'claim'
          if (parts[2]) {
            args.task = parts[2];
          }
        }
        break;
    }

    return {
      command,
      args,
      actor,
      issueNumber
    };
  }

  /**
   * Validate webhook event authenticity (placeholder for signature validation)
   */
  static validateWebhook(): boolean {
    // In a real implementation, this would validate the GitHub webhook signature
    // For simulation purposes, we'll return true
    return true;
  }

  /**
   * Extract wave number from issue title
   */
  static extractWaveNumber(title: string): number | null {
    const match = title.match(/Wave (\d+)/i);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Check if event should be processed (coordination issue filter)
   */
  static shouldProcessEvent(event: WebhookEvent): boolean {
    // Only process events on coordination issues
    if (event.issue) {
      return this.isCoordinationIssue(event.issue);
    }
    
    // For other events, check if they relate to coordination
    return false;
  }
}