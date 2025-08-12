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