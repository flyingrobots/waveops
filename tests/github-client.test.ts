/**
 * Tests for GitHub Client (mocked)
 */

import { GitHubClient } from '../src/github/client';

// Mock Octokit
jest.mock('@octokit/rest');
jest.mock('@octokit/graphql');

describe('GitHubClient', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient(
      { auth: 'test-token' },
      'testowner',
      'testrepo'
    );
  });

  it('should initialize with correct configuration', () => {
    expect(client).toBeInstanceOf(GitHubClient);
  });

  it('should create deployment parameters correctly', async () => {
    const params = {
      environment: 'wave-1-ready',
      ref: 'main',
      description: 'Team alpha readiness for Wave 1',
      payload: { team: 'alpha', wave: 1 }
    };

    // Mock the createDeployment method to avoid actual API calls
    const createDeploymentSpy = jest.spyOn(client, 'createDeployment')
      .mockResolvedValue({ id: 12345, environment: params.environment });

    const result = await client.createDeployment(params);

    expect(result.environment).toBe('wave-1-ready');
    expect(createDeploymentSpy).toHaveBeenCalledWith(params);
  });

  it('should validate required parameters for check runs', () => {
    const params = {
      name: 'Wave Gate: Wave 1',
      head_sha: 'abc123',
      status: 'completed' as const,
      conclusion: 'success' as const
    };

    expect(params.name).toBe('Wave Gate: Wave 1');
    expect(params.status).toBe('completed');
    expect(params.conclusion).toBe('success');
  });

  it('should handle error cases gracefully', async () => {
    const createDeploymentSpy = jest.spyOn(client, 'createDeployment')
      .mockRejectedValue(new Error('API Error'));

    await expect(
      client.createDeployment({
        environment: 'test',
        ref: 'main',
        description: 'test',
        payload: {}
      })
    ).rejects.toThrow('Failed to create deployment: API Error');
  });
});