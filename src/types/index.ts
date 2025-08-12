/**
 * Core type definitions for WaveOps
 */

export interface WaveState {
  plan: string;
  wave: number;
  tz: string;
  teams: Record<string, TeamState>;
  all_ready: boolean;
  updated_at: string;
}

export interface TeamState {
  status: 'ready' | 'in_progress' | 'blocked';
  at?: string;
  reason?: string;
  tasks: string[];
}

export interface Task {
  id: string;
  title: string;
  wave: number;
  team: string;
  depends_on: string[];
  acceptance: string[];
  critical: boolean;
}

// GitHub API types
export interface GitHubDeployment {
  id: number;
  environment: string;
  ref: string;
  description: string;
  created_at: string;
  updated_at: string;
  statuses_url: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null;
  output?: {
    title: string;
    summary: string;
  };
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  merged: boolean;
  merge_commit_sha: string | null;
  state: 'open' | 'closed';
  user: {
    login: string;
  };
}

export interface GitHubCommitStatus {
  state: 'pending' | 'success' | 'failure' | 'error';
  context: string;
  description: string;
  target_url: string | null;
}

export interface GitHubCommitChecks {
  statuses: GitHubCommitStatus[];
  checkRuns: GitHubCheckRun[];
  state: 'pending' | 'success' | 'failure' | 'error';
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}