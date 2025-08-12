/**
 * Tests for Deployment Gate System (W2.T003 - Bob)
 * GitHub Deployments for team readiness tracking tests
 */

import { DeploymentGate, DeploymentGateConfig } from '../src/core/deployment-gate';
import { GitHubClient } from '../src/github/client';
import { ValidationEngine } from '../src/core/validation-engine';
import { GitHubDeployment } from '../src/types';

// Mock dependencies
jest.mock('../src/github/client');
jest.mock('../src/core/validation-engine');

describe('Deployment Gate System (W2.T003)', () => {
  let deploymentGate: DeploymentGate;
  let mockClient: jest.Mocked<GitHubClient>;
  let mockValidator: jest.Mocked<ValidationEngine>;

  beforeEach(() => {
    mockClient = new GitHubClient({ auth: 'test' }, 'test-owner', 'test-repo') as jest.Mocked<GitHubClient>;
    deploymentGate = new DeploymentGate(mockClient);
    mockValidator = deploymentGate.validator as jest.Mocked<ValidationEngine>;
  });

  describe('Team readiness deployment creation', () => {
    it('should create deployment with correct environment names', async () => {
      const mockDeployment: GitHubDeployment = {
        id: 123,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'alpha team readiness for Wave 2: All tasks complete',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/123/statuses'
      };

      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.createTeamReadinessDeployment(
        'alpha',
        2,
        'success',
        'All tasks complete'
      );

      expect(mockClient.createDeployment).toHaveBeenCalledWith({
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'alpha team readiness for Wave 2: All tasks complete',
        payload: expect.objectContaining({
          team: 'alpha',
          wave: 2,
          status: 'success'
        })
      });

      expect(mockClient.updateDeploymentStatus).toHaveBeenCalledWith(
        123,
        'success',
        'All tasks complete'
      );

      expect(result).toEqual(mockDeployment);
    });

    it('should create failure deployment for blocked tasks', async () => {
      const mockDeployment: GitHubDeployment = {
        id: 124,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'beta team readiness for Wave 2: Blocked tasks: W2.T003, W2.T004',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/124/statuses'
      };

      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.createTeamReadinessDeployment(
        'beta',
        2,
        'failure',
        'Blocked tasks: W2.T003, W2.T004'
      );

      expect(result.environment).toBe('wave-2-ready');
      expect(mockClient.updateDeploymentStatus).toHaveBeenCalledWith(
        124,
        'failure',
        'Blocked tasks: W2.T003, W2.T004'
      );
    });
  });

  describe('Team validation and deployment updates', () => {
    it('should create success deployment when all tasks are valid', async () => {
      const teamTasks = [
        { taskId: 'W2.T001', issueNumber: 5 },
        { taskId: 'W2.T002', issueNumber: 6 }
      ];

      const mockValidationSummary = {
        allValid: true,
        validTasks: ['W2.T001', 'W2.T002'],
        invalidTasks: [],
        errors: []
      };

      const mockDeployment: GitHubDeployment = {
        id: 125,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'alpha team readiness for Wave 2: All tasks complete: W2.T001, W2.T002',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/125/statuses'
      };

      mockValidator.getTeamValidationSummary.mockResolvedValue(mockValidationSummary);
      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.validateAndUpdateTeamReadiness('alpha', 2, teamTasks);

      expect(result.ready).toBe(true);
      expect(result.team).toBe('alpha');
      expect(result.deployment).toEqual(mockDeployment);
      expect(result.validationSummary).toEqual(mockValidationSummary);
      expect(mockClient.createDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'wave-2-ready'
        })
      );
      expect(mockClient.updateDeploymentStatus).toHaveBeenCalledWith(125, 'success', expect.any(String));
    });

    it('should create failure deployment when tasks are invalid', async () => {
      const teamTasks = [
        { taskId: 'W2.T003', issueNumber: 7 },
        { taskId: 'W2.T004', issueNumber: 8 }
      ];

      const mockValidationSummary = {
        allValid: false,
        validTasks: ['W2.T003'],
        invalidTasks: ['W2.T004'],
        errors: ['W2.T004: Issue #8 is not closed']
      };

      const mockDeployment: GitHubDeployment = {
        id: 126,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'beta team readiness for Wave 2: Blocked tasks: W2.T004',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/126/statuses'
      };

      mockValidator.getTeamValidationSummary.mockResolvedValue(mockValidationSummary);
      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.validateAndUpdateTeamReadiness('beta', 2, teamTasks);

      expect(result.ready).toBe(false);
      expect(result.team).toBe('beta');
      expect(result.validationSummary.invalidTasks).toContain('W2.T004');
      expect(mockClient.updateDeploymentStatus).toHaveBeenCalledWith(126, 'failure', expect.stringContaining('W2.T004'));
    });

    it('should handle validation errors gracefully', async () => {
      const teamTasks = [{ taskId: 'W2.T001', issueNumber: 5 }];

      mockValidator.getTeamValidationSummary.mockRejectedValue(new Error('GitHub API error'));
      
      const mockDeployment: GitHubDeployment = {
        id: 127,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'alpha team readiness for Wave 2: Validation error: GitHub API error',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/127/statuses'
      };

      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.validateAndUpdateTeamReadiness('alpha', 2, teamTasks);

      expect(result.ready).toBe(false);
      expect(result.validationSummary.errors).toContain('GitHub API error');
      expect(mockClient.updateDeploymentStatus).toHaveBeenCalledWith(127, 'error', expect.stringContaining('GitHub API error'));
    });
  });

  describe('Wave gate status checking', () => {
    it('should report wave complete when all teams are ready', async () => {
      const config: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: {
          alpha: { tasks: [{ taskId: 'W2.T001', issueNumber: 5 }] },
          beta: { tasks: [{ taskId: 'W2.T003', issueNumber: 7 }] }
        }
      };

      // Mock both teams as ready
      mockValidator.getTeamValidationSummary.mockResolvedValue({
        allValid: true,
        validTasks: ['W2.T001'],
        invalidTasks: [],
        errors: []
      });

      const mockDeployment: GitHubDeployment = {
        id: 128,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'team readiness for Wave 2',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/128/statuses'
      };

      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.checkWaveGateStatus(config);

      expect(result.wave).toBe(2);
      expect(result.allTeamsReady).toBe(true);
      expect(result.readyTeams).toEqual(['alpha', 'beta']);
      expect(result.blockedTeams).toEqual([]);
      expect(result.teamResults).toHaveLength(2);
    });

    it('should report wave incomplete when some teams are blocked', async () => {
      const config: DeploymentGateConfig = {
        wave: 2,
        plan: 'waveops-v1',
        teams: {
          alpha: { tasks: [{ taskId: 'W2.T001', issueNumber: 5 }] },
          beta: { tasks: [{ taskId: 'W2.T003', issueNumber: 7 }] }
        }
      };

      // Mock alpha ready, beta blocked
      mockValidator.getTeamValidationSummary
        .mockResolvedValueOnce({
          allValid: true,
          validTasks: ['W2.T001'],
          invalidTasks: [],
          errors: []
        })
        .mockResolvedValueOnce({
          allValid: false,
          validTasks: [],
          invalidTasks: ['W2.T003'],
          errors: ['W2.T003: PR not merged']
        });

      const mockDeployment: GitHubDeployment = {
        id: 129,
        environment: 'wave-2-ready',
        ref: 'main',
        description: 'team readiness for Wave 2',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/repos/test/test/deployments/129/statuses'
      };

      mockClient.createDeployment.mockResolvedValue(mockDeployment);
      mockClient.updateDeploymentStatus.mockResolvedValue({});

      const result = await deploymentGate.checkWaveGateStatus(config);

      expect(result.allTeamsReady).toBe(false);
      expect(result.readyTeams).toEqual(['alpha']);
      expect(result.blockedTeams).toEqual(['beta']);
    });
  });

  describe('Status formatting', () => {
    it('should format ready team status correctly', () => {
      const readyResult = {
        team: 'alpha',
        ready: true,
        validationSummary: {
          allValid: true,
          validTasks: ['W2.T001', 'W2.T002'],
          invalidTasks: [],
          errors: []
        },
        lastChecked: '2024-01-01T10:30:00Z'
      };

      const formatted = deploymentGate.formatTeamReadinessStatus(readyResult);

      expect(formatted).toContain('✅ **Team Alpha Ready!**');
      expect(formatted).toContain('W2.T001, W2.T002');
      expect(formatted).toContain('wave-ready → SUCCESS');
      expect(formatted).toContain('🎉');
    });

    it('should format blocked team status correctly', () => {
      const blockedResult = {
        team: 'beta',
        ready: false,
        validationSummary: {
          allValid: false,
          validTasks: ['W2.T003'],
          invalidTasks: ['W2.T004'],
          errors: ['W2.T004: CI checks failed', 'W2.T004: Issue not closed']
        },
        lastChecked: '2024-01-01T10:30:00Z'
      };

      const formatted = deploymentGate.formatTeamReadinessStatus(blockedResult);

      expect(formatted).toContain('❌ **Team Beta Blocked**');
      expect(formatted).toContain('W2.T004');
      expect(formatted).toContain('wave-ready → FAILURE');
      expect(formatted).toContain('CI checks failed');
    });

    it('should format complete wave gate status', () => {
      const completeStatus = {
        wave: 2,
        allTeamsReady: true,
        teamResults: [],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T10:30:00Z'
      };

      const formatted = deploymentGate.formatWaveGateStatus(completeStatus);

      expect(formatted).toContain('🎉 **WAVE 2 COMPLETE!**');
      expect(formatted).toContain('Alpha, Beta');
      expect(formatted).toContain('Wave gate is open!');
    });
  });
});