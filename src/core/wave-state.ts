/**
 * Wave State Management - Core domain logic for wave coordination
 */

import { WaveState, TeamState } from '../types';

export class WaveStateManager {
  private state: WaveState;

  constructor(initialState: WaveState) {
    this.state = { ...initialState };
  }

  /**
   * Update team status with atomic state transition
   */
  updateTeamStatus(team: string, status: TeamState['status'], reason?: string): WaveState {
    const currentTime = new Date().toISOString();
    
    // Validate team exists
    if (!(team in this.state.teams)) {
      throw new Error(`Team '${team}' not found in wave state`);
    }

    // Create new state (immutable update)
    this.state = {
      ...this.state,
      teams: {
        ...this.state.teams,
        [team]: {
          ...this.state.teams[team],
          status,
          at: currentTime,
          reason: status === 'blocked' ? reason : undefined
        }
      },
      all_ready: this.computeAllReady({
        ...this.state.teams,
        [team]: {
          ...this.state.teams[team],
          status,
          at: currentTime,
          reason: status === 'blocked' ? reason : undefined
        }
      }),
      updated_at: currentTime
    };

    return { ...this.state };
  }

  /**
   * Get current state (immutable copy)
   */
  getState(): WaveState {
    return { ...this.state };
  }

  /**
   * Compute if all teams are ready
   */
  private computeAllReady(teams: Record<string, TeamState>): boolean {
    return Object.values(teams).every(team => team.status === 'ready');
  }

  /**
   * Serialize to JSON with stable key ordering
   */
  toJSON(): string {
    // Custom replacer to ensure stable ordering
    const replacer = (key: string, value: any) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const ordered: any = {};
        // Define key order for different object types
        if ('plan' in value) {
          // Root state object
          ['plan', 'wave', 'tz', 'teams', 'all_ready', 'updated_at'].forEach(k => {
            if (k in value) ordered[k] = value[k];
          });
        } else if ('status' in value) {
          // Team state object
          ['status', 'at', 'reason', 'tasks'].forEach(k => {
            if (k in value) ordered[k] = value[k];
          });
        } else {
          // Default: sort keys alphabetically
          Object.keys(value).sort().forEach(k => {
            ordered[k] = value[k];
          });
        }
        return ordered;
      }
      return value;
    };
    
    return JSON.stringify(this.state, replacer, 2);
  }

  /**
   * Parse from JSON string
   */
  static fromJSON(json: string): WaveStateManager {
    const state = JSON.parse(json) as WaveState;
    return new WaveStateManager(state);
  }
}