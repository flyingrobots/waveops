/**
 * Tests for Wave State Management
 */

import { WaveStateManager } from '../src/core/wave-state';
import { WaveState } from '../src/types';

describe('WaveStateManager', () => {
  const initialState: WaveState = {
    plan: 'test-wave',
    wave: 1,
    tz: 'UTC',
    teams: {
      alpha: { status: 'in_progress', tasks: ['T1', 'T2'] },
      beta: { status: 'in_progress', tasks: ['T3', 'T4'] }
    },
    all_ready: false,
    updated_at: '2025-01-01T00:00:00Z'
  };

  it('should update team status atomically', () => {
    const manager = new WaveStateManager(initialState);
    
    const newState = manager.updateTeamStatus('alpha', 'ready');
    
    expect(newState.teams.alpha.status).toBe('ready');
    expect(newState.teams.alpha.at).toBeDefined();
    expect(newState.all_ready).toBe(false); // beta still in_progress
    expect(newState.updated_at).not.toBe(initialState.updated_at);
  });

  it('should compute all_ready when all teams are ready', () => {
    const manager = new WaveStateManager(initialState);
    
    manager.updateTeamStatus('alpha', 'ready');
    const finalState = manager.updateTeamStatus('beta', 'ready');
    
    expect(finalState.all_ready).toBe(true);
  });

  it('should handle blocked status with reason', () => {
    const manager = new WaveStateManager(initialState);
    
    const newState = manager.updateTeamStatus('alpha', 'blocked', 'CI is flaky');
    
    expect(newState.teams.alpha.status).toBe('blocked');
    expect(newState.teams.alpha.reason).toBe('CI is flaky');
  });

  it('should serialize JSON with stable key ordering', () => {
    const manager = new WaveStateManager(initialState);
    const json1 = manager.toJSON();
    const json2 = manager.toJSON();
    
    expect(json1).toBe(json2); // Deterministic output
    expect(json1).toContain('"plan"');
    expect(json1).toContain('"wave"');
  });

  it('should roundtrip through JSON serialization', () => {
    const manager1 = new WaveStateManager(initialState);
    const json = manager1.toJSON();
    const manager2 = WaveStateManager.fromJSON(json);
    
    expect(manager2.getState()).toEqual(manager1.getState());
  });

  it('should throw error for unknown team', () => {
    const manager = new WaveStateManager(initialState);
    
    expect(() => {
      manager.updateTeamStatus('gamma', 'ready');
    }).toThrow("Team 'gamma' not found in wave state");
  });
});