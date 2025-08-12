/**
 * Tests for Wave Gate Check System (W2.T004 - Bob)
 * GitHub Check Run for wave completion tests
 */

import { WaveGateCheck, WaveGateCheckConfig } from '../src/core/wave-gate-check';
import { DeploymentGate, DeploymentGateConfig, WaveGateStatus } from '../src/core/deployment-gate';
import { GitHubClient } from '../src/github/client';
import { GitHubCheckRun, GitHubIssueComment } from '../src/types';
import { WaveState } from '../src/types';

// Mock dependencies
jest.mock('../src/github/client');
jest.mock('../src/core/deployment-gate');

describe('Wave Gate Check System (W2.T004)', () => {
  let waveGateCheck: WaveGateCheck;
  let mockClient: jest.Mocked<GitHubClient>;
  let mockDeploymentGate: jest.Mocked<DeploymentGate>;

  beforeEach(() => {
    mockClient = new GitHubClient({ auth: 'test' }, 'test-owner', 'test-repo') as jest.Mocked<GitHubClient>;
    waveGateCheck = new WaveGateCheck(mockClient);
    mockDeploymentGate = (waveGateCheck as unknown as { deploymentGate: jest.Mocked<DeploymentGate> }).deploymentGate;
    
    // Clear any active checks between tests
    WaveGateCheck.clearActiveChecks();
  });

  describe('All-teams-ready logic', () => {
    it('should create success check run when all teams are ready', async () => {
      const checkConfig: WaveGateCheckConfig = {
        wave: 2,
        plan: 'waveops-v1',
        checkName: 'Wave 2',
        coordinationIssueNumber: 24
      };

      const gateConfig: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: {
          alpha: { tasks: [{ taskId: 'W2.T001', issueNumber: 5 }] },
          beta: { tasks: [{ taskId: 'W2.T003', issueNumber: 7 }] }
        }
      };

      const allReadyStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [
          { 
            team: 'alpha', 
            ready: true, 
            validationSummary: { allValid: true, validTasks: ['W2.T001'], invalidTasks: [], errors: [] },
            lastChecked: '2024-01-01T10:00:00Z'
          },
          { 
            team: 'beta', 
            ready: true, 
            validationSummary: { allValid: true, validTasks: ['W2.T003'], invalidTasks: [], errors: [] },
            lastChecked: '2024-01-01T10:00:00Z'
          }
        ],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      const mockCheckRun: GitHubCheckRun = {
        id: 123,
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'completed',
        conclusion: 'success',
        output: {
          title: '🎉 Wave 2 Complete!',
          summary: 'All teams ready'
        }
      };

      mockDeploymentGate.checkWaveGateStatus.mockResolvedValue(allReadyStatus);
      mockClient.createCheckRun.mockResolvedValue(mockCheckRun);

      const result = await waveGateCheck.checkWaveGate(checkConfig, gateConfig);

      expect(result.waveComplete).toBe(true);
      expect(result.checkRun.conclusion).toBe('success');
      expect(result.newState.all_ready).toBe(true);
      expect(result.announcement).toContain('🎉 **WAVE 2 COMPLETE!**');
      expect(mockClient.createCheckRun).toHaveBeenCalledWith({
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'completed',
        conclusion: 'success',
        output: expect.objectContaining({
          title: '🎉 Wave 2 Complete!'
        })
      });
    });

    it('should create in-progress check run when teams are not all ready', async () => {
      const checkConfig: WaveGateCheckConfig = {
        wave: 2,
        plan: 'waveops-v1',
        checkName: 'Wave 2',
        coordinationIssueNumber: 24
      };

      const gateConfig: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: {
          alpha: { tasks: [{ taskId: 'W2.T001', issueNumber: 5 }] },
          beta: { tasks: [{ taskId: 'W2.T003', issueNumber: 7 }] }
        }
      };

      const partialReadyStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: false,
        teamResults: [
          { 
            team: 'alpha', 
            ready: true, 
            validationSummary: { allValid: true, validTasks: ['W2.T001'], invalidTasks: [], errors: [] },
            lastChecked: '2024-01-01T10:00:00Z'
          },
          { 
            team: 'beta', 
            ready: false, 
            validationSummary: { allValid: false, validTasks: [], invalidTasks: ['W2.T003'], errors: ['W2.T003: PR not merged'] },
            lastChecked: '2024-01-01T10:00:00Z'
          }
        ],
        readyTeams: ['alpha'],
        blockedTeams: ['beta'],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      const mockCheckRun: GitHubCheckRun = {
        id: 124,
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'in_progress',
        conclusion: null,
        output: {
          title: '🔄 Wave 2 In Progress',
          summary: 'Waiting for teams'
        }
      };

      mockDeploymentGate.checkWaveGateStatus.mockResolvedValue(partialReadyStatus);
      mockClient.createCheckRun.mockResolvedValue(mockCheckRun);

      const result = await waveGateCheck.checkWaveGate(checkConfig, gateConfig);

      expect(result.waveComplete).toBe(false);
      expect(result.checkRun.status).toBe('in_progress');
      expect(result.newState.all_ready).toBe(false);
      expect(result.announcement).toBeUndefined();
      expect(mockClient.createCheckRun).toHaveBeenCalledWith({
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'in_progress',
        output: expect.objectContaining({
          title: '🔄 Wave 2 In Progress'
        })
      });
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent double announcements for concurrent checks', async () => {
      const checkConfig: WaveGateCheckConfig = {
        wave: 2,
        plan: 'waveops-v1',
        checkName: 'Wave 2',
        coordinationIssueNumber: 24
      };

      const gateConfig: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: { alpha: { tasks: [] }, beta: { tasks: [] } }
      };

      const allReadyStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      mockDeploymentGate.checkWaveGateStatus.mockResolvedValue(allReadyStatus);
      mockClient.createCheckRun.mockResolvedValue({
        id: 125,
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'completed',
        conclusion: 'success'
      } as GitHubCheckRun);

      // Start two concurrent checks
      const [result1, result2] = await Promise.all([
        waveGateCheck.checkWaveGate(checkConfig, gateConfig),
        waveGateCheck.checkWaveGate(checkConfig, gateConfig)
      ]);

      // Should be the same result (race condition prevented)
      expect(result1).toBe(result2);
      expect(mockDeploymentGate.checkWaveGateStatus).toHaveBeenCalledTimes(1);
      expect(mockClient.createCheckRun).toHaveBeenCalledTimes(1);
    });

    it('should trigger gate check only when appropriate', () => {
      // No previous state - should trigger
      expect(WaveGateCheck.shouldTriggerGateCheck()).toBe(true);

      // Team just became ready - should trigger
      const previousState: WaveState = {
        plan: 'test',
        wave: 2,
        tz: 'UTC',
        teams: { alpha: { status: 'in_progress', tasks: [], at: '2024-01-01T09:00:00Z' } },
        all_ready: false,
        updated_at: '2024-01-01T09:00:00Z'
      };

      expect(WaveGateCheck.shouldTriggerGateCheck(previousState, { team: 'alpha', ready: true }))
        .toBe(true);

      // Team was already ready - should not trigger
      const readyState: WaveState = {
        ...previousState,
        teams: { alpha: { status: 'ready', tasks: [], at: '2024-01-01T09:00:00Z' } }
      };

      expect(WaveGateCheck.shouldTriggerGateCheck(readyState, { team: 'alpha', ready: true }))
        .toBe(false);
    });
  });

  describe('Check run visibility and functionality', () => {
    it('should create check run with proper GitHub UI integration', async () => {
      const checkConfig: WaveGateCheckConfig = {
        wave: 2,
        plan: 'waveops-v1',
        checkName: 'Wave 2',
        coordinationIssueNumber: 24
      };

      const gateConfig: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: { alpha: { tasks: [] } }
      };

      const gateStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [{ 
          team: 'alpha', 
          ready: true, 
          validationSummary: { allValid: true, validTasks: ['W2.T001'], invalidTasks: [], errors: [] },
          lastChecked: '2024-01-01T10:00:00Z'
        }],
        readyTeams: ['alpha'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      mockDeploymentGate.checkWaveGateStatus.mockResolvedValue(gateStatus);
      mockClient.createCheckRun.mockResolvedValue({
        id: 126,
        name: 'Wave Gate: Wave 2',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        output: {
          title: '🎉 Wave 2 Complete!',
          summary: 'Detailed summary with team status'
        }
      });

      await waveGateCheck.checkWaveGate(checkConfig, gateConfig);

      expect(mockClient.createCheckRun).toHaveBeenCalledWith({
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'completed',
        conclusion: 'success',
        output: {
          title: '🎉 Wave 2 Complete!',
          summary: expect.stringContaining('All teams have completed their Wave 2 tasks successfully!')
        }
      });
    });

    it('should update coordination issue with wave gate status', async () => {
      const gateStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      const announcement = '🎉 **WAVE 2 COMPLETE!**\n\nAll teams ready!';

      mockDeploymentGate.formatWaveGateStatus.mockReturnValue('Wave status summary');
      mockClient.addIssueComment.mockResolvedValue({} as GitHubIssueComment);

      await waveGateCheck.updateCoordinationIssue(24, gateStatus, announcement);

      expect(mockClient.addIssueComment).toHaveBeenCalledWith(
        24,
        expect.stringContaining('🎉 **WAVE 2 COMPLETE!**')
      );
      expect(mockClient.addIssueComment).toHaveBeenCalledWith(
        24,
        expect.stringContaining('Wave status summary')
      );
    });
  });

  describe('State management', () => {
    it('should create proper wave state updates', async () => {
      const checkConfig: WaveGateCheckConfig = {
        wave: 2,
        plan: 'waveops-v1',
        checkName: 'Wave 2',
        coordinationIssueNumber: 24
      };

      const gateConfig: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: {
          alpha: { tasks: [{ taskId: 'W2.T001', issueNumber: 5 }] },
          beta: { tasks: [{ taskId: 'W2.T003', issueNumber: 7 }] }
        }
      };

      const previousState: WaveState = {
        plan: 'waveops-v1',
        wave: 2,
        tz: 'UTC',
        teams: {
          alpha: { status: 'ready', tasks: ['W2.T001'], at: '2024-01-01T09:00:00Z' },
          beta: { status: 'in_progress', tasks: ['W2.T003'], at: '2024-01-01T09:00:00Z' }
        },
        all_ready: false,
        updated_at: '2024-01-01T09:00:00Z'
      };

      const gateStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [
          { 
            team: 'alpha', 
            ready: true, 
            validationSummary: { allValid: true, validTasks: ['W2.T001'], invalidTasks: [], errors: [] },
            lastChecked: '2024-01-01T10:00:00Z'
          },
          { 
            team: 'beta', 
            ready: true, 
            validationSummary: { allValid: true, validTasks: ['W2.T003'], invalidTasks: [], errors: [] },
            lastChecked: '2024-01-01T10:00:00Z'
          }
        ],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      mockDeploymentGate.checkWaveGateStatus.mockResolvedValue(gateStatus);
      mockClient.createCheckRun.mockResolvedValue({
        id: 127,
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'completed',
        conclusion: 'success'
      } as GitHubCheckRun);

      const result = await waveGateCheck.checkWaveGate(checkConfig, gateConfig, previousState);

      expect(result.previousState).toEqual(previousState);
      expect(result.newState.all_ready).toBe(true);
      expect(result.newState.teams.alpha.status).toBe('ready');
      expect(result.newState.teams.beta.status).toBe('ready');
      expect(result.newState.updated_at).toBe('2024-01-01T10:00:00Z');
    });

    it('should generate appropriate wave completion announcement', async () => {
      const checkConfig: WaveGateCheckConfig = {
        wave: 2,
        plan: 'waveops-v1',
        checkName: 'Wave 2',
        coordinationIssueNumber: 24
      };

      const gateConfig: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: { alpha: { tasks: [] }, beta: { tasks: [] } }
      };

      const gateStatus: WaveGateStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:00:00Z'
      };

      mockDeploymentGate.checkWaveGateStatus.mockResolvedValue(gateStatus);
      mockClient.createCheckRun.mockResolvedValue({
        id: 128,
        name: 'Wave Gate: Wave 2',
        head_sha: 'main',
        status: 'completed',
        conclusion: 'success'
      } as GitHubCheckRun);

      const result = await waveGateCheck.checkWaveGate(checkConfig, gateConfig);

      expect(result.announcement).toContain('🎉 **WAVE 2 COMPLETE!**');
      expect(result.announcement).toContain('**Team Alpha**, **Team Beta**');
      expect(result.announcement).toContain('Wave 3 tasks are now available');
      expect(result.announcement).toContain('Great work everyone! 🚀');
    });
  });
});