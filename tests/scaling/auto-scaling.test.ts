/**
 * Auto-Scaling Manager Tests
 * Comprehensive test suite for enterprise auto-scaling functionality
 */

import {
  EnterpriseAutoScalingManager,
  AutoScalingDependencies,
  ScalingMetricsCollector,
  ResourceManager,
  PredictiveScalingAnalyzer,
  CostOptimizer,
  ScalingExecutor,
  AutoScalingConfigManager,
  AutoScalingLogger,
  AutoScalingEventBus,
  ScalingRequest,
  ScalingType,
  ScalingPriority,
  ResourceSnapshot,
  ScalingResult,
  ScalingMetricValue,
  MetricTimeSeries,
  LoadPrediction,
  PredictiveScalingRecommendation,
  CostOptimizationResult,
  ScalingEvent,
  ScalingInitiator,
  AutoScalingEvent,
  AutoScalingEventType
} from '../../src/scaling/auto-scaling';

import {
  AutoScalingConfig,
  AutoScalingError,
  ResourceRequirement,
  ResourceType,
  ValidationResult,
  ScalingLimits,
  PredictiveModelType,
  CostOptimizationStrategy,
  CostStrategyType
} from '../../src/scaling/types';

describe('EnterpriseAutoScalingManager', () => {
  let autoScalingManager: EnterpriseAutoScalingManager;
  let mockDependencies: jest.Mocked<AutoScalingDependencies>;
  let mockMetricsCollector: jest.Mocked<ScalingMetricsCollector>;
  let mockResourceManager: jest.Mocked<ResourceManager>;
  let mockPredictiveAnalyzer: jest.Mocked<PredictiveScalingAnalyzer>;
  let mockCostOptimizer: jest.Mocked<CostOptimizer>;
  let mockScalingExecutor: jest.Mocked<ScalingExecutor>;
  let mockConfigManager: jest.Mocked<AutoScalingConfigManager>;
  let mockLogger: jest.Mocked<AutoScalingLogger>;
  let mockEventBus: jest.Mocked<AutoScalingEventBus>;

  const instanceId = 'test-instance-1';

  beforeEach(() => {
    // Create mocks
    mockMetricsCollector = {
      getMetrics: jest.fn(),
      getMetricHistory: jest.fn(),
      subscribeToMetric: jest.fn(),
      unsubscribeFromMetric: jest.fn()
    };

    mockResourceManager = {
      getCurrentResources: jest.fn(),
      scaleHorizontally: jest.fn(),
      scaleVertically: jest.fn(),
      getScalingLimits: jest.fn(),
      validateScalingRequest: jest.fn()
    };

    mockPredictiveAnalyzer = {
      predictLoad: jest.fn(),
      analyzeHistoricalPatterns: jest.fn(),
      getRecommendedScalingActions: jest.fn(),
      trainModel: jest.fn()
    };

    mockCostOptimizer = {
      analyzeCosts: jest.fn(),
      optimizeResources: jest.fn(),
      evaluateScalingCost: jest.fn(),
      getRecommendations: jest.fn()
    };

    mockScalingExecutor = {
      executeScaling: jest.fn(),
      rollbackScaling: jest.fn(),
      getScalingHistory: jest.fn(),
      scheduleScaling: jest.fn(),
      cancelScheduledScaling: jest.fn()
    };

    mockConfigManager = {
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
      validateConfig: jest.fn()
    };

    mockLogger = {
      logScalingEvent: jest.fn(),
      logCostOptimization: jest.fn(),
      logPredictiveScaling: jest.fn()
    };

    mockEventBus = {
      publishScalingEvent: jest.fn(),
      subscribeToEvents: jest.fn()
    };

    mockDependencies = {
      metricsCollector: mockMetricsCollector,
      resourceManager: mockResourceManager,
      predictiveAnalyzer: mockPredictiveAnalyzer,
      costOptimizer: mockCostOptimizer,
      scalingExecutor: mockScalingExecutor,
      configManager: mockConfigManager,
      logger: mockLogger,
      eventBus: mockEventBus
    };

    // Setup default mock responses
    mockConfigManager.getConfig.mockReturnValue(createMockAutoScalingConfig());
    mockConfigManager.validateConfig.mockReturnValue(true);
    mockResourceManager.getCurrentResources.mockResolvedValue(createMockResourceSnapshot());
    mockResourceManager.getScalingLimits.mockReturnValue(createMockScalingLimits());
    mockResourceManager.validateScalingRequest.mockResolvedValue({ valid: true, reasons: [], warnings: [] });

    autoScalingManager = new EnterpriseAutoScalingManager(mockDependencies, instanceId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should start auto-scaling manager successfully', async () => {
      // Act
      await autoScalingManager.start();

      // Assert
      expect(mockConfigManager.validateConfig).toHaveBeenCalled();
      expect(mockMetricsCollector.subscribeToMetric).toHaveBeenCalledTimes(4); // 3 custom + 3 standard - overlap
      expect(mockLogger.logScalingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Auto-scaling manager started successfully'
        })
      );
    });

    it('should throw error if configuration is invalid', async () => {
      // Arrange
      mockConfigManager.validateConfig.mockReturnValue(false);

      // Act & Assert
      await expect(autoScalingManager.start()).rejects.toThrow(AutoScalingError);
    });

    it('should set up metric subscriptions correctly', async () => {
      // Act
      await autoScalingManager.start();

      // Assert
      expect(mockMetricsCollector.subscribeToMetric).toHaveBeenCalledWith(
        'cpu_utilization',
        expect.any(Function)
      );
      expect(mockMetricsCollector.subscribeToMetric).toHaveBeenCalledWith(
        'memory_utilization',
        expect.any(Function)
      );
      expect(mockMetricsCollector.subscribeToMetric).toHaveBeenCalledWith(
        'coordination_latency',
        expect.any(Function)
      );
    });
  });

  describe('stop', () => {
    it('should stop auto-scaling manager and cleanup resources', async () => {
      // Arrange
      await autoScalingManager.start();

      // Act
      await autoScalingManager.stop();

      // Assert
      expect(mockMetricsCollector.unsubscribeFromMetric).toHaveBeenCalled();
      expect(mockLogger.logScalingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Auto-scaling manager stopped'
        })
      );
    });
  });

  describe('triggerScaling', () => {
    it('should trigger manual scaling successfully', async () => {
      // Arrange
      await autoScalingManager.start();
      
      const scalingRequest: ScalingRequest = {
        type: ScalingType.HORIZONTAL_UP,
        targetReplicas: 5,
        reason: 'Manual scaling test',
        priority: ScalingPriority.HIGH
      };

      const mockScalingResult: ScalingResult = {
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: { ...createMockResourceSnapshot(), currentReplicas: 5 },
        scalingDuration: 120000,
        reason: scalingRequest.reason
      };

      mockScalingExecutor.executeScaling.mockResolvedValue(mockScalingResult);

      // Act
      const result = await autoScalingManager.triggerScaling(scalingRequest);

      // Assert
      expect(result).toBe(mockScalingResult);
      expect(mockResourceManager.validateScalingRequest).toHaveBeenCalledWith(scalingRequest);
      expect(mockScalingExecutor.executeScaling).toHaveBeenCalledWith(scalingRequest);
      expect(mockLogger.logScalingEvent).toHaveBeenCalled();
    });

    it('should throw error when auto-scaling manager is not running', async () => {
      // Arrange
      const scalingRequest: ScalingRequest = {
        type: ScalingType.HORIZONTAL_UP,
        targetReplicas: 5,
        reason: 'Manual scaling test',
        priority: ScalingPriority.HIGH
      };

      // Act & Assert
      await expect(autoScalingManager.triggerScaling(scalingRequest))
        .rejects.toThrow('Auto-scaling manager is not running');
    });

    it('should reject scaling when validation fails', async () => {
      // Arrange
      await autoScalingManager.start();
      
      const scalingRequest: ScalingRequest = {
        type: ScalingType.HORIZONTAL_UP,
        targetReplicas: 100, // Exceeds limits
        reason: 'Invalid scaling test',
        priority: ScalingPriority.HIGH
      };

      mockResourceManager.validateScalingRequest.mockResolvedValue({
        valid: false,
        reasons: ['Target replicas exceed maximum limit'],
        warnings: []
      });

      // Act & Assert
      await expect(autoScalingManager.triggerScaling(scalingRequest))
        .rejects.toThrow('Invalid scaling request');
    });
  });

  describe('Horizontal Scaling', () => {
    it('should scale up when CPU utilization is high', async () => {
      // Arrange
      await autoScalingManager.start();

      const highCpuMetric: ScalingMetricValue = {
        name: 'cpu_utilization',
        value: 85, // Above 70% threshold
        timestamp: new Date(),
        labels: { instanceId }
      };

      const mockMetrics = new Map<string, ScalingMetricValue>([
        ['cpu_utilization', highCpuMetric],
        ['memory_utilization', { name: 'memory_utilization', value: 60, timestamp: new Date(), labels: {} }]
      ]);

      mockMetricsCollector.getMetrics.mockResolvedValue(mockMetrics);
      mockResourceManager.getCurrentResources.mockResolvedValue({
        currentReplicas: 3,
        totalCPU: 3000,
        totalMemory: 6144,
        averageCPUUtilization: 85,
        averageMemoryUtilization: 60,
        activeConnections: 150,
        timestamp: new Date()
      });

      const mockScalingResult: ScalingResult = {
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: { ...createMockResourceSnapshot(), currentReplicas: 4 },
        scalingDuration: 120000,
        reason: 'High CPU utilization: 85%'
      };

      mockScalingExecutor.executeScaling.mockResolvedValue(mockScalingResult);

      // Simulate the horizontal scaling evaluation
      const evaluateHorizontalScaling = (autoScalingManager as any).evaluateHorizontalScaling.bind(autoScalingManager);

      // Act
      await evaluateHorizontalScaling();

      // Assert
      expect(mockScalingExecutor.executeScaling).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ScalingType.HORIZONTAL_UP,
          reason: expect.stringContaining('High CPU utilization')
        })
      );
    });

    it('should scale down when utilization is low', async () => {
      // Arrange
      await autoScalingManager.start();

      const lowUtilizationMetrics = new Map<string, ScalingMetricValue>([
        ['cpu_utilization', { name: 'cpu_utilization', value: 25, timestamp: new Date(), labels: {} }],
        ['memory_utilization', { name: 'memory_utilization', value: 30, timestamp: new Date(), labels: {} }]
      ]);

      mockMetricsCollector.getMetrics.mockResolvedValue(lowUtilizationMetrics);
      mockResourceManager.getCurrentResources.mockResolvedValue({
        currentReplicas: 5,
        totalCPU: 5000,
        totalMemory: 10240,
        averageCPUUtilization: 25,
        averageMemoryUtilization: 30,
        activeConnections: 50,
        timestamp: new Date()
      });

      const mockScalingResult: ScalingResult = {
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: { ...createMockResourceSnapshot(), currentReplicas: 3 },
        scalingDuration: 90000,
        reason: 'Low resource utilization - CPU: 25%, Memory: 30%'
      };

      mockScalingExecutor.executeScaling.mockResolvedValue(mockScalingResult);

      // Simulate the horizontal scaling evaluation
      const evaluateHorizontalScaling = (autoScalingManager as any).evaluateHorizontalScaling.bind(autoScalingManager);

      // Act
      await evaluateHorizontalScaling();

      // Assert
      expect(mockScalingExecutor.executeScaling).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ScalingType.HORIZONTAL_DOWN,
          reason: expect.stringContaining('Low resource utilization')
        })
      );
    });
  });

  describe('Vertical Scaling', () => {
    it('should recommend vertical scaling when resource usage is consistently high', async () => {
      // Arrange
      await autoScalingManager.start();

      const highUsageHistory: MetricTimeSeries = {
        metricName: 'cpu_utilization',
        dataPoints: Array.from({ length: 12 }, (_, i) => ({
          timestamp: new Date(Date.now() - i * 5 * 60 * 1000), // Every 5 minutes
          value: 85 + Math.random() * 10, // 85-95% usage
          labels: {}
        })),
        timeRange: {
          start: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          end: new Date()
        }
      };

      mockMetricsCollector.getMetricHistory.mockResolvedValue(highUsageHistory);

      const mockScalingResult: ScalingResult = {
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: createMockResourceSnapshot(),
        scalingDuration: 180000,
        reason: 'High resource utilization - CPU: 87%, Memory: 82%'
      };

      mockScalingExecutor.executeScaling.mockResolvedValue(mockScalingResult);

      // Simulate the vertical scaling evaluation
      const evaluateVerticalScaling = (autoScalingManager as any).evaluateVerticalScaling.bind(autoScalingManager);

      // Act
      await evaluateVerticalScaling();

      // Assert
      expect(mockMetricsCollector.getMetricHistory).toHaveBeenCalledWith('cpu_utilization', 3600000);
      expect(mockScalingExecutor.executeScaling).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ScalingType.VERTICAL_UP,
          resourceRequirements: expect.arrayContaining([
            expect.objectContaining({
              resource: ResourceType.CPU,
              type: 'request'
            })
          ])
        })
      );
    });
  });

  describe('Predictive Scaling', () => {
    it('should execute predictive scaling recommendations', async () => {
      // Arrange
      await autoScalingManager.start();

      const predictiveRecommendation: PredictiveScalingRecommendation = {
        action: {
          type: ScalingType.HORIZONTAL_UP,
          targetReplicas: 6,
          executionDelay: 0
        },
        reason: 'Predicted load increase in next 30 minutes',
        confidence: 0.85,
        estimatedTime: new Date(Date.now() + 30 * 60 * 1000),
        impact: {
          throughputChange: 20,
          delayReduction: 15000,
          resourceEfficiency: 0.8,
          riskLevel: 0.2
        },
        priority: ScalingPriority.MEDIUM
      };

      mockPredictiveAnalyzer.getRecommendedScalingActions
        .mockResolvedValue([predictiveRecommendation]);

      const mockScalingResult: ScalingResult = {
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: { ...createMockResourceSnapshot(), currentReplicas: 6 },
        scalingDuration: 150000,
        reason: predictiveRecommendation.reason
      };

      mockScalingExecutor.executeScaling.mockResolvedValue(mockScalingResult);

      // Set confidence threshold to accept the recommendation
      const config = createMockAutoScalingConfig();
      config.predictiveScaling.confidenceThreshold = 0.8;
      mockConfigManager.getConfig.mockReturnValue(config);

      // Simulate the predictive scaling evaluation
      const evaluatePredictiveScaling = (autoScalingManager as any).evaluatePredictiveScaling.bind(autoScalingManager);

      // Act
      await evaluatePredictiveScaling();

      // Assert
      expect(mockPredictiveAnalyzer.getRecommendedScalingActions).toHaveBeenCalled();
      expect(mockScalingExecutor.executeScaling).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('Predictive scaling')
        })
      );
      expect(mockLogger.logPredictiveScaling).toHaveBeenCalledWith(predictiveRecommendation);
    });

    it('should schedule future scaling actions', async () => {
      // Arrange
      await autoScalingManager.start();

      const futureRecommendation: PredictiveScalingRecommendation = {
        action: {
          type: ScalingType.HORIZONTAL_UP,
          targetReplicas: 8,
          executionDelay: 300000 // 5 minutes in future
        },
        reason: 'Predicted traffic spike',
        confidence: 0.9,
        estimatedTime: new Date(Date.now() + 300000),
        impact: {
          throughputChange: 30,
          delayReduction: 20000,
          resourceEfficiency: 0.85,
          riskLevel: 0.15
        },
        priority: ScalingPriority.HIGH
      };

      mockPredictiveAnalyzer.getRecommendedScalingActions
        .mockResolvedValue([futureRecommendation]);

      const config = createMockAutoScalingConfig();
      config.predictiveScaling.confidenceThreshold = 0.8;
      mockConfigManager.getConfig.mockReturnValue(config);

      const evaluatePredictiveScaling = (autoScalingManager as any).evaluatePredictiveScaling.bind(autoScalingManager);

      // Act
      await evaluatePredictiveScaling();

      // Assert
      expect(mockScalingExecutor.scheduleScaling).toHaveBeenCalledWith(
        expect.objectContaining({
          scalingRequest: expect.objectContaining({
            type: ScalingType.HORIZONTAL_UP,
            targetReplicas: 8
          }),
          scheduledTime: expect.any(Date)
        })
      );
    });
  });

  describe('Cost Optimization', () => {
    it('should apply cost optimization strategies', async () => {
      // Arrange
      await autoScalingManager.start();

      const optimizationResult: CostOptimizationResult = {
        appliedStrategies: [{
          name: 'Spot Instance Usage',
          type: CostStrategyType.SPOT_INSTANCES,
          priority: 1,
          enabled: true,
          parameters: { spotPercentage: 50 }
        }],
        estimatedSavings: 250.50,
        implementationDate: new Date(),
        success: true,
        errors: []
      };

      mockCostOptimizer.optimizeResources.mockResolvedValue(optimizationResult);

      const evaluateCostOptimization = (autoScalingManager as any).evaluateCostOptimization.bind(autoScalingManager);

      // Act
      await evaluateCostOptimization();

      // Assert
      expect(mockCostOptimizer.optimizeResources).toHaveBeenCalled();
      expect(mockLogger.logCostOptimization).toHaveBeenCalledWith(optimizationResult);
      expect(mockEventBus.publishScalingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AutoScalingEventType.COST_OPTIMIZATION_APPLIED,
          data: expect.objectContaining({
            estimatedSavings: 250.50
          })
        })
      );
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive auto-scaling status', async () => {
      // Arrange
      await autoScalingManager.start();

      const mockMetrics = new Map<string, ScalingMetricValue>([
        ['cpu_utilization', { name: 'cpu_utilization', value: 65, timestamp: new Date(), labels: {} }],
        ['memory_utilization', { name: 'memory_utilization', value: 70, timestamp: new Date(), labels: {} }]
      ]);

      const mockCostAnalysis = {
        currentMonthlyCost: 1500,
        projectedMonthlyCost: 1600,
        costBreakdown: {
          compute: 1200,
          storage: 200,
          network: 100,
          monitoring: 50,
          other: 50
        },
        inefficiencies: [],
        optimizationOpportunities: []
      };

      mockMetricsCollector.getMetrics.mockResolvedValue(mockMetrics);
      mockCostOptimizer.analyzeCosts.mockResolvedValue(mockCostAnalysis);

      // Act
      const status = await autoScalingManager.getStatus();

      // Assert
      expect(status).toEqual(
        expect.objectContaining({
          isRunning: true,
          scalingInProgress: false,
          currentResources: expect.any(Object),
          configuration: expect.any(Object),
          metrics: Array.from(mockMetrics.values()),
          costAnalysis: mockCostAnalysis,
          lastUpdate: expect.any(Date)
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle scaling executor failures gracefully', async () => {
      // Arrange
      await autoScalingManager.start();

      const scalingRequest: ScalingRequest = {
        type: ScalingType.HORIZONTAL_UP,
        targetReplicas: 5,
        reason: 'Test scaling',
        priority: ScalingPriority.HIGH
      };

      mockScalingExecutor.executeScaling.mockRejectedValue(
        new Error('Scaling execution failed')
      );

      // Act & Assert
      await expect(autoScalingManager.triggerScaling(scalingRequest))
        .rejects.toThrow('Scaling execution failed');

      expect(mockEventBus.publishScalingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AutoScalingEventType.SCALING_FAILED
        })
      );
    });

    it('should handle metrics collection failures', async () => {
      // Arrange
      await autoScalingManager.start();

      mockMetricsCollector.getMetrics.mockRejectedValue(
        new Error('Metrics service unavailable')
      );

      const evaluateHorizontalScaling = (autoScalingManager as any).evaluateHorizontalScaling.bind(autoScalingManager);

      // Act
      await evaluateHorizontalScaling();

      // Assert
      expect(mockEventBus.publishScalingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AutoScalingEventType.SCALING_FAILED,
          data: expect.objectContaining({
            type: 'horizontal_scaling_evaluation',
            error: 'Metrics service unavailable'
          })
        })
      );
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle rapid scaling requests', async () => {
      // Arrange
      await autoScalingManager.start();

      const rapidRequests = Array.from({ length: 10 }, (_, i) => ({
        type: ScalingType.HORIZONTAL_UP,
        targetReplicas: 3 + i,
        reason: `Rapid scaling test ${i}`,
        priority: ScalingPriority.HIGH
      }));

      // Mock successful scaling for all requests
      mockScalingExecutor.executeScaling.mockImplementation(async (request) => ({
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: { ...createMockResourceSnapshot(), currentReplicas: request.targetReplicas! },
        scalingDuration: 100,
        reason: request.reason
      }));

      // Act
      const startTime = Date.now();
      const results = [];
      
      for (const request of rapidRequests) {
        try {
          const result = await autoScalingManager.triggerScaling(request);
          results.push(result);
        } catch (error) {
          // Expected that some may fail due to scaling in progress
          expect((error as Error).message).toContain('already in progress');
        }
      }

      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(5000); // Should handle within 5 seconds
      expect(results.length).toBeGreaterThan(0); // At least some should succeed
    });
  });

  describe('Integration Testing', () => {
    it('should coordinate between all auto-scaling components', async () => {
      // Arrange
      const config = createMockAutoScalingConfig();
      config.predictiveScaling.enabled = true;
      config.costOptimization.enabled = true;
      mockConfigManager.getConfig.mockReturnValue(config);

      // Mock high utilization metrics
      const highUtilizationMetrics = new Map<string, ScalingMetricValue>([
        ['cpu_utilization', { name: 'cpu_utilization', value: 85, timestamp: new Date(), labels: {} }],
        ['memory_utilization', { name: 'memory_utilization', value: 80, timestamp: new Date(), labels: {} }]
      ]);

      // Mock predictive recommendation
      const predictiveRecommendation: PredictiveScalingRecommendation = {
        action: {
          type: ScalingType.HORIZONTAL_UP,
          targetReplicas: 6,
          executionDelay: 0
        },
        reason: 'Combined metric and predictive scaling',
        confidence: 0.9,
        estimatedTime: new Date(),
        impact: {
          throughputChange: 25,
          delayReduction: 18000,
          resourceEfficiency: 0.82,
          riskLevel: 0.18
        },
        priority: ScalingPriority.HIGH
      };

      // Mock cost optimization
      const optimizationResult: CostOptimizationResult = {
        appliedStrategies: [],
        estimatedSavings: 150,
        implementationDate: new Date(),
        success: true,
        errors: []
      };

      // Setup mocks
      mockMetricsCollector.getMetrics.mockResolvedValue(highUtilizationMetrics);
      mockPredictiveAnalyzer.getRecommendedScalingActions.mockResolvedValue([predictiveRecommendation]);
      mockCostOptimizer.optimizeResources.mockResolvedValue(optimizationResult);
      
      mockScalingExecutor.executeScaling.mockResolvedValue({
        success: true,
        previousState: createMockResourceSnapshot(),
        newState: { ...createMockResourceSnapshot(), currentReplicas: 6 },
        scalingDuration: 120000,
        reason: 'Integrated scaling decision'
      });

      // Act
      await autoScalingManager.start();

      // Simulate evaluation cycles
      const evaluateHorizontalScaling = (autoScalingManager as any).evaluateHorizontalScaling.bind(autoScalingManager);
      const evaluatePredictiveScaling = (autoScalingManager as any).evaluatePredictiveScaling.bind(autoScalingManager);
      const evaluateCostOptimization = (autoScalingManager as any).evaluateCostOptimization.bind(autoScalingManager);

      await evaluateHorizontalScaling();
      await evaluatePredictiveScaling();
      await evaluateCostOptimization();

      // Assert
      expect(mockScalingExecutor.executeScaling).toHaveBeenCalled();
      expect(mockLogger.logPredictiveScaling).toHaveBeenCalledWith(predictiveRecommendation);
      expect(mockLogger.logCostOptimization).toHaveBeenCalledWith(optimizationResult);
      expect(mockEventBus.publishScalingEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AutoScalingEventType.COST_OPTIMIZATION_APPLIED
        })
      );
    });
  });
});

// Helper functions
function createMockAutoScalingConfig(): AutoScalingConfig {
  return {
    enabled: true,
    horizontalScaling: {
      minReplicas: 2,
      maxReplicas: 10,
      targetCPUUtilization: 70,
      targetMemoryUtilization: 80,
      scaleUpBehavior: {
        stabilizationWindowSeconds: 60,
        selectPolicy: 0, // MAX
        policies: []
      },
      scaleDownBehavior: {
        stabilizationWindowSeconds: 300,
        selectPolicy: 1, // MIN
        policies: []
      },
      customMetrics: [{
        name: 'coordination_latency',
        selector: { matchLabels: {}, matchExpressions: [] },
        target: {
          type: 1, // AVERAGE_VALUE
          averageValue: '1000'
        }
      }]
    },
    verticalScaling: {
      enabled: true,
      updateMode: 3, // AUTO
      resourcePolicy: {
        containerPolicies: []
      }
    },
    predictiveScaling: {
      enabled: true,
      modelType: 0, // LINEAR_REGRESSION
      lookAheadMinutes: 30,
      confidenceThreshold: 0.8,
      historicalDataWindow: 7
    },
    costOptimization: {
      enabled: true,
      strategies: [],
      budgetLimits: [],
      rightsizingEnabled: true,
      spotInstancesEnabled: false,
      scheduledScaling: []
    }
  };
}

function createMockResourceSnapshot(): ResourceSnapshot {
  return {
    currentReplicas: 3,
    totalCPU: 3000,
    totalMemory: 6144,
    averageCPUUtilization: 65,
    averageMemoryUtilization: 70,
    activeConnections: 150,
    timestamp: new Date()
  };
}

function createMockScalingLimits(): ScalingLimits {
  return {
    minReplicas: 2,
    maxReplicas: 10,
    minCPU: '100m',
    maxCPU: '4000m',
    minMemory: '256Mi',
    maxMemory: '8Gi'
  };
}