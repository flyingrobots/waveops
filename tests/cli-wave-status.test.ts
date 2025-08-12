/**
 * Tests for Wave Status CLI (W3.T001 - Alice)
 * Wave status monitoring script tests
 */

// Mock dependencies before importing
jest.mock('../src/github/client');
jest.mock('../src/core/deployment-gate', () => ({
  DeploymentGate: jest.fn().mockImplementation(() => ({
    checkWaveGateStatus: jest.fn(),
    formatWaveGateStatus: jest.fn()
  }))
}));
jest.mock('../src/core/wave-gate-check', () => ({
  WaveGateCheck: jest.fn().mockImplementation(() => ({
    checkWaveGate: jest.fn(),
    updateCoordinationIssue: jest.fn()
  })),
  shouldTriggerGateCheck: jest.fn()
}));

import { WaveStatusChecker } from '../src/cli/wave-status';
import { GitHubClient } from '../src/github/client';

describe('Wave Status CLI (W3.T001)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'test-owner/test-repo'
    };
    
    // Setup default mocks
    (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = jest.fn().mockResolvedValue({ items: [] });
    
    const mockDeploymentGate = require('../src/core/deployment-gate').DeploymentGate;
    mockDeploymentGate.prototype.checkWaveGateStatus = jest.fn().mockResolvedValue({
      wave: 1,
      allTeamsReady: false,
      readyTeams: [],
      blockedTeams: [],
      teamResults: [],
      lastUpdated: '2024-01-01T10:00:00Z'
    });
    
    const mockWaveGateCheck = require('../src/core/wave-gate-check').WaveGateCheck;
    mockWaveGateCheck.shouldTriggerGateCheck = jest.fn().mockReturnValue(false);
    mockWaveGateCheck.prototype.checkWaveGate = jest.fn().mockResolvedValue({
      waveComplete: false,
      checkRun: { id: 1, name: 'test', head_sha: 'main', status: 'in_progress', conclusion: null },
      newState: { all_ready: false }
    });
    mockWaveGateCheck.prototype.updateCoordinationIssue = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('WaveStatusChecker initialization', () => {
    it('should require GITHUB_TOKEN environment variable', () => {
      delete process.env.GITHUB_TOKEN;
      
      expect(() => new WaveStatusChecker()).toThrow('GITHUB_TOKEN environment variable is required');
    });

    it('should require GITHUB_REPOSITORY environment variable', () => {
      delete process.env.GITHUB_REPOSITORY;
      
      expect(() => new WaveStatusChecker()).toThrow('GITHUB_REPOSITORY environment variable is required');
    });

    it('should parse repository correctly', () => {
      const checker = new WaveStatusChecker();
      expect(GitHubClient).toHaveBeenCalledWith(
        { auth: 'test-token' },
        'test-owner',
        'test-repo'
      );
    });
  });

  describe('Active wave detection', () => {
    let checker: WaveStatusChecker;

    beforeEach(() => {
      checker = new WaveStatusChecker();
    });

    it('should find coordination issues', async () => {
      const mockSearchIssues = (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues as jest.MockedFunction<any>;
      mockSearchIssues.mockResolvedValueOnce({
        items: [
          {
            number: 18,
            title: 'Wave 1 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }, { name: 'wave:1' }]
          },
          {
            number: 24,
            title: 'Wave 2 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }, { name: 'wave:2' }]
          }
        ]
      });

      // Override deployment gate status for this test instance
      jest.spyOn(checker['deploymentGate'], 'checkWaveGateStatus')
        .mockResolvedValue({
          wave: 1,
          allTeamsReady: false,
          readyTeams: [],
          blockedTeams: ['alpha', 'beta'],
          teamResults: [],
          lastUpdated: '2024-01-01T10:00:00Z'
        });

      await checker.checkWaveStatus({});

      expect(mockSearchIssues).toHaveBeenCalledWith('is:open label:coordination');
    });

    it('should handle no active waves', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: []
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      await checker.checkWaveStatus({});

      expect(mockSearchIssues).toHaveBeenCalled();
    });

    it('should parse wave numbers from titles correctly', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: [
          {
            number: 18,
            title: 'Wave 1 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }]
          },
          {
            number: 24,
            title: 'Wave 2 · production-plan · Coordination',
            labels: [{ name: 'coordination' }]
          },
          {
            number: 25,
            title: 'Invalid coordination issue',
            labels: [{ name: 'coordination' }]
          }
        ]
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      await checker.checkWaveStatus({});

      expect(mockSearchIssues).toHaveBeenCalled();
    });
  });

  describe('Wave status checking', () => {
    let checker: WaveStatusChecker;

    beforeEach(() => {
      checker = new WaveStatusChecker();
    });

    it('should check single wave status', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: [
          {
            number: 24,
            title: 'Wave 2 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }]
          }
        ]
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      await checker.checkWaveStatus({ verbose: true });

      expect(mockSearchIssues).toHaveBeenCalled();
    });

    it('should handle wave checking errors gracefully', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: [
          {
            number: 24,
            title: 'Wave 2 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }]
          }
        ]
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      // Mock deployment gate to throw error
      const { DeploymentGate } = require('../src/core/deployment-gate');
      DeploymentGate.prototype.checkWaveGateStatus = jest.fn().mockRejectedValue(new Error('API Error'));

      await checker.checkWaveStatus({});

      expect(mockSearchIssues).toHaveBeenCalled();
    });
  });

  describe('Status reporting', () => {
    let checker: WaveStatusChecker;

    beforeEach(() => {
      checker = new WaveStatusChecker();
    });

    it('should generate status report with no waves', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: []
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      const report = await checker.generateStatusReport();

      expect(report).toContain('No active waves');
      expect(report).toContain('All waves are complete');
    });

    it('should generate status report with active waves', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: [
          {
            number: 24,
            title: 'Wave 2 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }]
          }
        ]
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      const { DeploymentGate } = require('../src/core/deployment-gate');
      DeploymentGate.prototype.checkWaveGateStatus = jest.fn().mockResolvedValue({
        wave: 2,
        allTeamsReady: true,
        teamResults: [
          { team: 'alpha', ready: true },
          { team: 'beta', ready: true }
        ],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: [],
        lastUpdated: '2024-01-01T00:00:00Z'
      });

      const report = await checker.generateStatusReport();

      expect(report).toContain('Wave Status Report');
      expect(report).toContain('Wave 2');
      expect(report).toContain('READY FOR COMPLETION');
    });

    it('should handle errors in status report generation', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: [
          {
            number: 24,
            title: 'Wave 2 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }]
          }
        ]
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      const { DeploymentGate } = require('../src/core/deployment-gate');
      DeploymentGate.prototype.checkWaveGateStatus = jest.fn().mockRejectedValue(new Error('API Error'));

      const report = await checker.generateStatusReport();

      expect(report).toContain('Error checking status');
    });
  });

  describe('Command line options', () => {
    it('should handle verbose flag', async () => {
      const checker = new WaveStatusChecker();

      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: []
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      await checker.checkWaveStatus({ verbose: true });

      expect(mockSearchIssues).toHaveBeenCalled();
    });

    it('should handle specific wave filtering', async () => {
      const checker = new WaveStatusChecker();

      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: []
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      await checker.checkWaveStatus({ wave: '2' });

      expect(mockSearchIssues).toHaveBeenCalled();
    });

    it('should handle specific plan filtering', async () => {
      const checker = new WaveStatusChecker();

      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: []
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      await checker.checkWaveStatus({ plan: 'production' });

      expect(mockSearchIssues).toHaveBeenCalled();
    });
  });

  describe('Integration with wave coordination', () => {
    let checker: WaveStatusChecker;

    beforeEach(() => {
      checker = new WaveStatusChecker();
    });

    it('should trigger wave gate checks when appropriate', async () => {
      const mockSearchIssues = jest.fn().mockResolvedValue({
        items: [
          {
            number: 24,
            title: 'Wave 2 · waveops-v1 · Coordination',
            labels: [{ name: 'coordination' }]
          }
        ]
      });

      (GitHubClient as jest.MockedClass<typeof GitHubClient>).prototype.searchIssues = mockSearchIssues;

      const { DeploymentGate } = require('../src/core/deployment-gate');
      const { WaveGateCheck } = require('../src/core/wave-gate-check');

      DeploymentGate.prototype.checkWaveGateStatus = jest.fn().mockResolvedValue({
        allTeamsReady: true,
        teamResults: [],
        readyTeams: ['alpha', 'beta'],
        blockedTeams: []
      });

      WaveGateCheck.shouldTriggerGateCheck = jest.fn().mockReturnValue(true);
      WaveGateCheck.prototype.checkWaveGate = jest.fn().mockResolvedValue({
        waveComplete: true,
        announcement: 'Wave complete!'
      });
      WaveGateCheck.prototype.updateCoordinationIssue = jest.fn();

      await checker.checkWaveStatus({});

      expect(WaveGateCheck.prototype.checkWaveGate).toHaveBeenCalled();
      expect(WaveGateCheck.prototype.updateCoordinationIssue).toHaveBeenCalled();
    });
  });
});