/**
 * Comprehensive unit tests for the Metrics Advisor system
 */

import { 
  MetricsAdvisor, 
  WaveAnalysisResult, 
  PerformanceDashboard,
  Alert 
} from '../../src/analytics/metrics-advisor';
import { MetricsCollector } from '../../src/analytics/metrics-collector';
import { PerformanceAnalyzer } from '../../src/analytics/performance-analyzer';
import { GitHubClient } from '../../src/github/client';
import {
  WaveState,
  Task,
  WaveMetrics,
  TeamMetrics,
  AnalyticsConfig,
  AlertThresholds,
  PerformancePattern,
  WavePrediction,
  BottleneckInfo
} from '../../src/types';
import { 
  AnalyticsError, 
  ConfigurationError, 
  MetricsCollectionError 
} from '../../src/analytics/errors';

// Mock the dependencies
jest.mock('../../src/analytics/metrics-collector');
jest.mock('../../src/analytics/performance-analyzer');
jest.mock('../../src/github/client');

describe('MetricsAdvisor', () => {
  let metricsAdvisor: MetricsAdvisor;
  let mockGitHubClient: jest.Mocked<GitHubClient>;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockPerformanceAnalyzer: jest.Mocked<PerformanceAnalyzer>;
  let mockConfig: AnalyticsConfig;

  const createMockWaveState = (): WaveState => ({
    plan: 'test-plan',
    wave: 1,
    tz: 'UTC',
    teams: {
      'team-a': {
        status: 'in_progress',
        at: '2023-01-01T10:00:00Z',
        tasks: ['task-1', 'task-2'],
        reason: 'Working on features'
      },
      'team-b': {
        status: 'ready',
        at: '2023-01-01T09:00:00Z', 
        tasks: ['task-3'],
        reason: 'Ready for next wave'
      }
    },
    all_ready: false,
    updated_at: '2023-01-01T10:30:00Z'
  });

  const createMockTasks = (): Task[] => [
    {
      id: 'task-1',
      title: 'Implement feature A',
      wave: 1,
      team: 'team-a',
      depends_on: [],
      acceptance: ['Feature works correctly', 'Tests pass'],
      critical: true
    },
    {
      id: 'task-2',
      title: 'Add tests for feature A',
      wave: 1,
      team: 'team-a',
      depends_on: ['task-1'],
      acceptance: ['All tests pass'],
      critical: false
    },
    {
      id: 'task-3',
      title: 'Update documentation',
      wave: 1,
      team: 'team-b',
      depends_on: ['task-1'],
      acceptance: ['Documentation is updated'],
      critical: false
    }
  ];

  const createMockWaveMetrics = (): WaveMetrics => ({
    waveId: 'test-plan_wave_1',
    planName: 'test-plan',
    waveNumber: 1,
    startTime: new Date('2023-01-01T08:00:00Z'),
    endTime: undefined,
    duration: undefined,
    status: 'in_progress',
    teamMetrics: {
      'team-a': {
        teamId: 'team-a',
        occupancy: 85,
        barrierStallPercent: 25,
        readySkew: 10,
        warpDivergence: {
          median: 2000,
          p95: 5000,
          maxDivergence: 8000,
          convergenceTime: 10000
        },
        firstPassCI: 78,
        reviewLatency: {
          p50: 7200000,
          p90: 14400000,
          p95: 21600000,
          p99: 28800000,
          mean: 9000000,
          max: 36000000
        },
        velocity: 2.5,
        throughput: 3,
        defectRate: 12,
        communicationOverhead: 18
      },
      'team-b': {
        teamId: 'team-b',
        occupancy: 65,
        barrierStallPercent: 35,
        readySkew: 5,
        warpDivergence: {
          median: 1500,
          p95: 3000,
          maxDivergence: 4000,
          convergenceTime: 6000
        },
        firstPassCI: 92,
        reviewLatency: {
          p50: 5400000,
          p90: 10800000,
          p95: 14400000,
          p99: 18000000,
          mean: 7200000,
          max: 21600000
        },
        velocity: 1.8,
        throughput: 2,
        defectRate: 5,
        communicationOverhead: 15
      }
    },
    totalTasks: 3,
    completedTasks: 1,
    blockedTasks: 0,
    criticalPath: ['task-1', 'task-2'],
    bottlenecks: []
  });

  const createMockConfig = (): AnalyticsConfig => ({
    collectionInterval: 300000, // 5 minutes
    retentionPeriod: 2592000000, // 30 days
    analysisWindowSize: 10,
    alertThresholds: {
      highBarrierStall: 40,
      lowOccupancy: 50,
      highReviewLatency: 86400000, // 24 hours
      criticalBottleneckDelay: 14400000, // 4 hours
      lowFirstPassCI: 70,
      highWarpDivergence: 10000
    },
    enablePredictiveAnalytics: true,
    enableRealTimeAnalysis: true
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockGitHubClient = new GitHubClient({ auth: 'test-token' }, 'test-owner', 'test-repo') as jest.Mocked<GitHubClient>;
    mockConfig = createMockConfig();

    // Create mocked classes
    mockMetricsCollector = new (MetricsCollector as jest.MockedClass<typeof MetricsCollector>)(
      mockGitHubClient, 
      mockConfig
    ) as jest.Mocked<MetricsCollector>;

    mockPerformanceAnalyzer = new (PerformanceAnalyzer as jest.MockedClass<typeof PerformanceAnalyzer>)() as jest.Mocked<PerformanceAnalyzer>;

    // Create the MetricsAdvisor instance
    metricsAdvisor = new MetricsAdvisor(mockGitHubClient, mockConfig);

    // Override the private instances (this is a bit hacky but necessary for testing)
    (metricsAdvisor as any).metricsCollector = mockMetricsCollector;
    (metricsAdvisor as any).performanceAnalyzer = mockPerformanceAnalyzer;
  });

  describe('Constructor', () => {
    it('should create instance with valid configuration', () => {
      const validClient = new GitHubClient({ auth: 'test-token' }, 'test-owner', 'test-repo');
      expect(() => new MetricsAdvisor(validClient, mockConfig)).not.toThrow();
    });

    it('should throw ConfigurationError for invalid configuration', () => {
      const validClient = new GitHubClient({ auth: 'test-token' }, 'test-owner', 'test-repo');
      const invalidConfig = { ...mockConfig, collectionInterval: 500 }; // Too small
      
      expect(() => new MetricsAdvisor(validClient, invalidConfig))
        .toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for missing required fields', () => {
      const validClient = new GitHubClient({ auth: 'test-token' }, 'test-owner', 'test-repo');
      const incompleteConfig = { collectionInterval: 5000 } as AnalyticsConfig;
      
      expect(() => new MetricsAdvisor(validClient, incompleteConfig))
        .toThrow(ConfigurationError);
    });
  });

  describe('analyzeWavePerformance', () => {
    it('should perform comprehensive wave analysis successfully', async () => {
      // Setup mocks
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();
      const mockMetrics = createMockWaveMetrics();
      const mockPatterns: PerformancePattern[] = [
        {
          patternId: 'test-pattern',
          type: 'anti_pattern',
          name: 'Test Anti-Pattern',
          description: 'Test description',
          severity: 'warning',
          frequency: 0.3,
          impact: 'medium',
          affectedMetrics: ['occupancy'],
          recommendations: ['Fix the issue'],
          detectionConfidence: 0.8
        }
      ];
      const mockPrediction: WavePrediction = {
        waveId: 'test-plan_wave_1',
        estimatedCompletionTime: new Date('2023-01-08T17:00:00Z'),
        confidenceInterval: {
          lower: new Date('2023-01-07T17:00:00Z'),
          upper: new Date('2023-01-09T17:00:00Z')
        },
        riskFactors: [],
        criticalPathDuration: 172800000, // 2 days
        probabilityOfOnTimeCompletion: 0.75
      };

      mockMetricsCollector.collectWaveMetrics.mockResolvedValue(mockMetrics);
      mockPerformanceAnalyzer.detectPerformancePatterns.mockResolvedValue(mockPatterns);
      mockPerformanceAnalyzer.predictWaveCompletion.mockResolvedValue(mockPrediction);

      const result = await metricsAdvisor.analyzeWavePerformance(mockWaveState, mockTasks);

      expect(result).toBeDefined();
      expect(result.metrics).toEqual(mockMetrics);
      expect(result.patterns).toEqual(mockPatterns);
      expect(result.prediction).toEqual(mockPrediction);
      expect(result.healthScore).toBeGreaterThan(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.alerts).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should handle errors during analysis gracefully', async () => {
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();

      mockMetricsCollector.collectWaveMetrics.mockRejectedValue(
        new Error('Collection failed')
      );

      await expect(metricsAdvisor.analyzeWavePerformance(mockWaveState, mockTasks))
        .rejects.toThrow(AnalyticsError);
    });

    it('should calculate appropriate health scores', async () => {
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();
      const mockMetrics = createMockWaveMetrics();
      
      // Create metrics with different characteristics
      const highPerformanceMetrics = {
        ...mockMetrics,
        completedTasks: 3, // 100% completion
        bottlenecks: [], // No bottlenecks
        teamMetrics: {
          ...mockMetrics.teamMetrics,
          'team-a': {
            ...mockMetrics.teamMetrics['team-a'],
            firstPassCI: 95, // High quality
            barrierStallPercent: 5 // Low stall
          }
        }
      };

      mockMetricsCollector.collectWaveMetrics.mockResolvedValue(highPerformanceMetrics);
      mockPerformanceAnalyzer.detectPerformancePatterns.mockResolvedValue([]);
      mockPerformanceAnalyzer.predictWaveCompletion.mockResolvedValue({} as WavePrediction);

      const result = await metricsAdvisor.analyzeWavePerformance(mockWaveState, mockTasks);

      expect(result.healthScore).toBeGreaterThan(80); // Should be high
    });
  });

  describe('generateRecommendations', () => {
    it('should generate relevant recommendations from patterns', async () => {
      const mockMetrics = createMockWaveMetrics();
      const mockPatterns: PerformancePattern[] = [
        {
          patternId: 'high_barrier_stall',
          type: 'anti_pattern',
          name: 'High Dependency Wait Time',
          description: 'Teams spending too much time waiting for dependencies',
          severity: 'error',
          frequency: 0.6,
          impact: 'high',
          affectedMetrics: ['barrierStallPercent'],
          recommendations: [
            'Parallelize independent tasks',
            'Implement dependency caching'
          ],
          detectionConfidence: 0.9
        }
      ];

      const recommendations = await metricsAdvisor.generateRecommendations(mockMetrics, mockPatterns);

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].type).toBe('dependency_optimization');
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[0].confidence).toBeGreaterThan(0);
    });

    it('should limit recommendations to avoid overwhelming users', async () => {
      const mockMetrics = createMockWaveMetrics();
      
      // Create many patterns to test limiting
      const mockPatterns: PerformancePattern[] = Array.from({ length: 20 }, (_, i) => ({
        patternId: `pattern-${i}`,
        type: 'anti_pattern',
        name: `Pattern ${i}`,
        description: `Description ${i}`,
        severity: 'warning',
        frequency: 0.1,
        impact: 'low',
        affectedMetrics: ['occupancy'],
        recommendations: [`Recommendation ${i}`],
        detectionConfidence: 0.5
      }));

      const recommendations = await metricsAdvisor.generateRecommendations(mockMetrics, mockPatterns);

      expect(recommendations.length).toBeLessThanOrEqual(10);
    });

    it('should prioritize recommendations correctly', async () => {
      const mockMetrics = createMockWaveMetrics();
      const mockPatterns: PerformancePattern[] = [
        {
          patternId: 'low-priority',
          type: 'anti_pattern',
          name: 'Low Priority Issue',
          description: 'Minor issue',
          severity: 'info',
          frequency: 0.1,
          impact: 'low',
          affectedMetrics: ['occupancy'],
          recommendations: ['Minor fix'],
          detectionConfidence: 0.6
        },
        {
          patternId: 'high-priority',
          type: 'anti_pattern',
          name: 'Critical Issue',
          description: 'Major problem',
          severity: 'critical',
          frequency: 0.8,
          impact: 'critical',
          affectedMetrics: ['duration'],
          recommendations: ['Urgent fix required'],
          detectionConfidence: 0.95
        }
      ];

      const recommendations = await metricsAdvisor.generateRecommendations(mockMetrics, mockPatterns);

      expect(recommendations[0].priority).toBe('critical');
      expect(recommendations[recommendations.length - 1].priority).toBe('low');
    });
  });

  describe('generateAlerts', () => {
    it('should generate alerts for threshold violations', async () => {
      const mockMetrics = createMockWaveMetrics();
      
      // Modify metrics to trigger alerts
      mockMetrics.teamMetrics['team-a'].barrierStallPercent = 50; // Above threshold
      mockMetrics.teamMetrics['team-b'].occupancy = 40; // Below threshold
      mockMetrics.teamMetrics['team-a'].firstPassCI = 60; // Below threshold

      const alerts = await metricsAdvisor.generateAlerts(mockMetrics, mockConfig.alertThresholds);

      expect(alerts.length).toBeGreaterThan(0);
      
      // Check for barrier stall alert
      const barrierAlert = alerts.find(alert => alert.type === 'blocking');
      expect(barrierAlert).toBeDefined();
      expect(barrierAlert?.severity).toBe('high'); // 50% barrier stall is 'high', not 'critical'

      // Check for low occupancy alert
      const occupancyAlert = alerts.find(alert => alert.type === 'resource');
      expect(occupancyAlert).toBeDefined();

      // Check for low CI alert
      const ciAlert = alerts.find(alert => alert.type === 'quality');
      expect(ciAlert).toBeDefined();
    });

    it('should not generate alerts when metrics are within thresholds', async () => {
      const mockMetrics = createMockWaveMetrics();
      
      // Ensure all metrics are within acceptable ranges
      mockMetrics.teamMetrics['team-a'].barrierStallPercent = 20;
      mockMetrics.teamMetrics['team-b'].occupancy = 70;
      mockMetrics.teamMetrics['team-a'].firstPassCI = 85;

      const alerts = await metricsAdvisor.generateAlerts(mockMetrics, mockConfig.alertThresholds);

      expect(alerts.length).toBe(0);
    });

    it('should generate critical bottleneck alerts', async () => {
      const mockMetrics = createMockWaveMetrics();
      
      // Add critical bottleneck
      mockMetrics.bottlenecks = [
        {
          type: 'dependency',
          severity: 'critical',
          affectedTasks: ['task-1'],
          affectedTeams: ['team-a'],
          estimatedDelay: 18000000, // 5 hours - above threshold
          description: 'Critical external dependency blocked',
          detectedAt: new Date()
        }
      ];

      const alerts = await metricsAdvisor.generateAlerts(mockMetrics, mockConfig.alertThresholds);

      const bottleneckAlert = alerts.find(alert => alert.title.includes('Critical Bottleneck'));
      expect(bottleneckAlert).toBeDefined();
      expect(bottleneckAlert?.severity).toBe('critical');
    });
  });

  describe('createPerformanceDashboard', () => {
    it('should create comprehensive dashboard', async () => {
      const mockMetrics = createMockWaveMetrics();
      const waveId = 'test-plan_wave_1';

      // Mock the private method call (this is a bit hacky but necessary)
      jest.spyOn(metricsAdvisor as any, 'getHistoricalMetrics').mockResolvedValue([mockMetrics]);
      mockPerformanceAnalyzer.calculateTrends.mockResolvedValue({
        completionTimeTrend: 0.1,
        throughputTrend: 0.05
      });
      mockPerformanceAnalyzer.detectPerformancePatterns.mockResolvedValue([]);

      const dashboard = await metricsAdvisor.createPerformanceDashboard(waveId);

      expect(dashboard).toBeDefined();
      expect(dashboard.waveId).toBe(waveId);
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.summary.progress).toBeDefined();
      expect(dashboard.summary.healthScore).toBeGreaterThanOrEqual(0);
      expect(dashboard.teamPerformance).toBeDefined();
      expect(Object.keys(dashboard.teamPerformance)).toContain('team-a');
      expect(Object.keys(dashboard.teamPerformance)).toContain('team-b');
      expect(dashboard.trends).toBeDefined();
      expect(dashboard.lastUpdated).toBeDefined();
    });

    it('should handle missing metrics gracefully', async () => {
      const waveId = 'nonexistent-wave';

      jest.spyOn(metricsAdvisor as any, 'getHistoricalMetrics').mockResolvedValue([]);

      await expect(metricsAdvisor.createPerformanceDashboard(waveId))
        .rejects.toThrow(AnalyticsError);
    });
  });

  describe('exportMetricsReport', () => {
    it('should export JSON format report', async () => {
      const mockMetrics = createMockWaveMetrics();
      const waveId = 'test-plan_wave_1';

      jest.spyOn(metricsAdvisor as any, 'getHistoricalMetrics').mockResolvedValue([mockMetrics]);
      mockPerformanceAnalyzer.calculateTrends.mockResolvedValue({});
      mockPerformanceAnalyzer.detectPerformancePatterns.mockResolvedValue([]);

      const report = await metricsAdvisor.exportMetricsReport(waveId, 'json');

      expect(report).toBeDefined();
      expect(() => JSON.parse(report)).not.toThrow();
      
      const parsed = JSON.parse(report);
      expect(parsed.waveId).toBe(waveId);
    });

    it('should export summary format report', async () => {
      const mockMetrics = createMockWaveMetrics();
      const waveId = 'test-plan_wave_1';

      jest.spyOn(metricsAdvisor as any, 'getHistoricalMetrics').mockResolvedValue([mockMetrics]);
      mockPerformanceAnalyzer.calculateTrends.mockResolvedValue({});
      mockPerformanceAnalyzer.detectPerformancePatterns.mockResolvedValue([]);

      const report = await metricsAdvisor.exportMetricsReport(waveId, 'summary');

      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      expect(report).toContain('Wave Performance Report');
      expect(report).toContain(waveId);
      expect(report).toContain('Summary');
      expect(report).toContain('Team Performance');
    });
  });

  describe('predictWaveOutcome', () => {
    it('should predict wave completion successfully', async () => {
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();
      const mockMetrics = createMockWaveMetrics();
      const mockPrediction: WavePrediction = {
        waveId: 'test-plan_wave_1',
        estimatedCompletionTime: new Date('2023-01-08T17:00:00Z'),
        confidenceInterval: {
          lower: new Date('2023-01-07T17:00:00Z'),
          upper: new Date('2023-01-09T17:00:00Z')
        },
        riskFactors: [],
        criticalPathDuration: 172800000,
        probabilityOfOnTimeCompletion: 0.75
      };

      mockMetricsCollector.collectWaveMetrics.mockResolvedValue(mockMetrics);
      mockPerformanceAnalyzer.predictWaveCompletion.mockResolvedValue(mockPrediction);
      jest.spyOn(metricsAdvisor as any, 'getHistoricalMetrics').mockResolvedValue([]);

      const prediction = await metricsAdvisor.predictWaveOutcome(mockWaveState, mockTasks);

      expect(prediction).toEqual(mockPrediction);
      expect(prediction.probabilityOfOnTimeCompletion).toBeGreaterThanOrEqual(0);
      expect(prediction.probabilityOfOnTimeCompletion).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle metrics collection errors appropriately', async () => {
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();

      mockMetricsCollector.collectWaveMetrics.mockRejectedValue(
        new MetricsCollectionError('GitHub API unavailable')
      );

      await expect(metricsAdvisor.analyzeWavePerformance(mockWaveState, mockTasks))
        .rejects.toThrow(AnalyticsError);
    });

    it('should handle performance analysis errors appropriately', async () => {
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();
      const mockMetrics = createMockWaveMetrics();

      mockMetricsCollector.collectWaveMetrics.mockResolvedValue(mockMetrics);
      mockPerformanceAnalyzer.detectPerformancePatterns.mockRejectedValue(
        new Error('Analysis failed')
      );

      await expect(metricsAdvisor.analyzeWavePerformance(mockWaveState, mockTasks))
        .rejects.toThrow(AnalyticsError);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle real-world wave scenario with mixed team performance', async () => {
      const mockWaveState = createMockWaveState();
      const mockTasks = createMockTasks();
      
      // Create realistic metrics with varying team performance
      const realisticMetrics: WaveMetrics = {
        ...createMockWaveMetrics(),
        teamMetrics: {
          'high-performer': {
            teamId: 'high-performer',
            occupancy: 85,
            barrierStallPercent: 10,
            readySkew: 5,
            warpDivergence: {
              median: 1000,
              p95: 2000,
              maxDivergence: 3000,
              convergenceTime: 4000
            },
            firstPassCI: 95,
            reviewLatency: {
              p50: 3600000,
              p90: 7200000,
              p95: 10800000,
              p99: 14400000,
              mean: 5400000,
              max: 18000000
            },
            velocity: 4.2,
            throughput: 5,
            defectRate: 3,
            communicationOverhead: 10
          },
          'struggling-team': {
            teamId: 'struggling-team',
            occupancy: 95,
            barrierStallPercent: 60,
            readySkew: 25,
            warpDivergence: {
              median: 5000,
              p95: 12000,
              maxDivergence: 18000,
              convergenceTime: 20000
            },
            firstPassCI: 45,
            reviewLatency: {
              p50: 21600000,
              p90: 43200000,
              p95: 64800000,
              p99: 86400000,
              mean: 32400000,
              max: 108000000
            },
            velocity: 1.1,
            throughput: 1,
            defectRate: 35,
            communicationOverhead: 40
          }
        }
      };

      mockMetricsCollector.collectWaveMetrics.mockResolvedValue(realisticMetrics);
      mockPerformanceAnalyzer.detectPerformancePatterns.mockResolvedValue([]);
      mockPerformanceAnalyzer.predictWaveCompletion.mockResolvedValue({} as WavePrediction);

      const result = await metricsAdvisor.analyzeWavePerformance(mockWaveState, mockTasks);

      expect(result).toBeDefined();
      expect(result.alerts.length).toBeGreaterThan(0); // Should have alerts for struggling team
      expect(result.recommendations.length).toBeGreaterThan(0); // Should have recommendations
      expect(result.healthScore).toBeLessThan(80); // Overall health should be impacted
    });
  });
});