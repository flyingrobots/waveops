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
        // Support multiple formats: /ready wave-1, /ready wave:1, /ready 1
        if (parts[1]) {
          const waveMatch = parts[1].match(/(?:wave[-:]?)?(\d+)/i);
          if (waveMatch) {
            args.wave = parseInt(waveMatch[1]);
          }
        }
        break;
        
      case 'blocked': {
        // Parse reason with multiple quote styles: reason:"...", reason:'...', reason:...
        const reasonMatch = body.match(/reason[:=]\s*['"']?([^'"]+)['"']?/i);
        if (reasonMatch) {
          args.reason = reasonMatch[1].trim();
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
   * Validate team membership and command authorization
   */
  static async validateTeamMembership(actor: string, command: string, args: Record<string, string | number>): Promise<{ valid: boolean; team?: string; error?: string }> {
    // In a real implementation, this would load teams.yaml and validate membership
    // For simulation purposes, we'll use hardcoded team assignments
    const teamMemberships = {
      'alice': 'alpha',
      'bob': 'beta'
    };

    const userTeam = teamMemberships[actor as keyof typeof teamMemberships];
    if (!userTeam) {
      return { valid: false, error: `User ${actor} is not a member of any team` };
    }

    // Validate command authorization
    switch (command) {
      case 'ready':
        // Only team members can mark their team ready
        return { valid: true, team: userTeam };
      
      case 'blocked':
        // Team members can report blocks
        return { valid: true, team: userTeam };
      
      case 'claim': {
        // Team members can claim tasks assigned to their team
        const taskId = args.task as string;
        if (taskId && taskId.startsWith('W2.T')) {
          const teamAssignments = {
            'W2.T001': 'alpha', 'W2.T002': 'alpha',
            'W2.T003': 'beta', 'W2.T004': 'beta'
          };
          const taskTeam = teamAssignments[taskId as keyof typeof teamAssignments];
          if (taskTeam !== userTeam) {
            return { valid: false, error: `Task ${taskId} is assigned to team ${taskTeam}, not ${userTeam}` };
          }
        }
        return { valid: true, team: userTeam };
      }
        
      default:
        return { valid: true, team: userTeam };
    }
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